import dotenv from 'dotenv';
import express from 'express';
import { google } from 'googleapis';
import bodyParser from 'body-parser';
import fs from 'fs';
import Bull from 'bull';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
app.use(bodyParser.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Load previously saved tokens, if they exist
if (fs.existsSync('tokens.json')) {
  const tokens = JSON.parse(fs.readFileSync('tokens.json'));
  oAuth2Client.setCredentials(tokens);
}

// Generate an OAuth URL and redirect there
app.get('/auth', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
  });
  res.redirect(authUrl);
});

// Handle the OAuth2 callback
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync('tokens.json', JSON.stringify(tokens));
  res.send('Authentication successful! You can now close this window.');
});


const emailQueue = new Bull('emailQueue');

// Add a job to the queue to check for new emails every minute
emailQueue.add({}, { repeat: { cron: '* * * * *' } });

emailQueue.on('completed', (job, result) => {
  console.log(`Job completed with result ${result}`);
});

emailQueue.on('failed', (job, err) => {
  console.log(`Job failed with error ${err}`);
});

// Process the email checking job
emailQueue.process(async (job) => {
  console.log('Processing job...');
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  // Read the last processed email ID
  let lastEmailId = '';
  if (fs.existsSync('lastEmailId.txt')) {
    lastEmailId = fs.readFileSync('lastEmailId.txt', 'utf8');
  }

  // Fetch unread emails newer than the last processed email ID
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: 10,
  });
  const messages = res.data.messages || [];

  for (const message of messages) {
    if (message.id > lastEmailId) {
      const msg = await gmail.users.messages.get({ userId: 'me', id: message.id });
      const emailData = msg.data;
      console.log('Email data:', emailData);
      const parsedEmail = await parseEmailWithGemini(emailData);
      const label = categorizeEmail(parsedEmail);
      console.log('Email label:', label);
      await labelEmail(gmail, message.id, label);
      await sendAutoReply(gmail, emailData, label);

      // Update the last processed email ID
      fs.writeFileSync('lastEmailId.txt', message.id);

      // Break after processing one email
      break;
    }
  }
});

// Function to parse email using Gemini API
async function parseEmailWithGemini(emailData) {
  console.log('Parsing email with Gemini:', emailData.snippet);

  const googleAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const geminiConfig = {
    temperature: 0.9,
    topP: 1,
    topK: 1,
    maxOutputTokens: 4096,
  };
  
  const geminiModel = googleAI.getGenerativeModel({
    model: 'gemini-pro',
    geminiConfig,
  });

  const prompt = emailData.snippet;
  const result = await geminiModel.generateContent(prompt);
  const response = result.response;
  const parsedEmail = response.text();

  console.log('Gemini API response:', parsedEmail);
  return parsedEmail;
}

// Function to categorize the email
function categorizeEmail(parsedEmail) {
  console.log('Categorizing email:', parsedEmail);
  if (parsedEmail.includes('interested')) {
    return 'Interested';
  } else if (parsedEmail.includes('not interested')) {
    return 'Not Interested';
  } else {
    return 'More information';
  }
}

async function ensureLabelExists(gmail, labelName) {
  const res = await gmail.users.labels.list({ userId: 'me' });
  const labels = res.data.labels;
  const label = labels.find(l => l.name === labelName);

  if (label) {
    return label.id;
  } else {
    const newLabelRes = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    return newLabelRes.data.id;
  }
}

async function labelEmail(gmail, messageId, label) {
  const labelIds = {
    'Interested': await ensureLabelExists(gmail, 'Interested'),
    'Not Interested': await ensureLabelExists(gmail, 'Not Interested'),
    'More information': await ensureLabelExists(gmail, 'More information'),
  };
  console.log('Labeling email:', messageId, label);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    resource: {
      addLabelIds: [labelIds[label]],
    },
  });
}

// Function to send automated reply
async function sendAutoReply(gmail, emailData, label) {
  const replies = {
    'Interested': 'Thank you for your interest! Are you available for a demo call?',
    'Not Interested': 'Thank you for your response. Let us know if you change your mind.',
    'More information': 'Can you please specify what additional information you need?',
  };
  const rawMessage = [
    'From: me',
    `To: ${emailData.payload.headers.find(header => header.name === 'From').value}`,
    'Subject: Re: Your Email',
    '',
    replies[label],
  ].join('\n');

  console.log('Sending auto reply:', rawMessage);

  const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

  await gmail.users.messages.send({
    userId: 'me',
    resource: {
      raw: encodedMessage,
    },
  });
}

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
