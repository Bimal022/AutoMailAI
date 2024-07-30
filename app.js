require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const fs = require('fs');
const Bull = require('bull');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const GEMINI_API_URL = 'https://api.gemini.com/v1/parse';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

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
    ],
  });
  res.redirect(authUrl);
});

// Handle the OAuth2 callback
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  // Save the tokens to a file (optional)
  fs.writeFileSync('tokens.json', JSON.stringify(tokens));
  res.send('Authentication successful! You can now close this window.');
});

// Create a new Bull queue
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
  const res = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 10 });
  const messages = res.data.messages || [];
  
  for (const message of messages) {
    if (message.id > lastEmailId) { // Process only new emails
      const msg = await gmail.users.messages.get({ userId: 'me', id: message.id });
      const emailData = msg.data;
      console.log('Email data:', emailData);
      const parsedEmail = await parseEmailWithGemini(emailData);
      const label = categorizeEmail(parsedEmail);
      console.log('Email label:', label);
      await labelEmail(gmail, message.id, label);
      await sendAutoReply(gmail, parsedEmail, label);

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
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${GEMINI_API_KEY}`,
  };
  const body = {
    email: emailData.snippet,
  };
  const response = await axios.post(GEMINI_API_URL, body, { headers });
  console.log('Gemini API response:', response.data);
  return response.data;
}

// Function to categorize the email
function categorizeEmail(parsedEmail) {
  console.log('Categorizing email:', parsedEmail);
  // Implement your categorization logic based on parsedEmail content
  if (parsedEmail.includes('interested')) {
    return 'Interested';
  } else if (parsedEmail.includes('not interested')) {
    return 'Not Interested';
  } else {
    return 'More information';
  }
}

// Function to label email in Gmail
async function labelEmail(gmail, messageId, label) {
  const labels = {
    Interested: 'Label_1',
    'Not Interested': 'Label_2',
    'More information': 'Label_3',
  };
  console.log('Labeling email:', messageId, label);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    resource: {
      addLabelIds: [labels[label]],
    },
  });
}

// Function to send automated reply
async function sendAutoReply(gmail, parsedEmail, label) {
  const replies = {
    Interested: 'Thank you for your interest! Are you available for a demo call?',
    'Not Interested': 'Thank you for your response. Let us know if you change your mind.',
    'More information': 'Can you please specify what additional information you need?',
  };
  const rawMessage = [
    'From: me',
    `To: ${parsedEmail.from}`,
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
