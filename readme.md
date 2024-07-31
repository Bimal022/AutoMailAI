# ReachInbox Email Automation Tool

## Demo

[![Loom Video](https://www.loom.com/share/19e0e79b20e6441e87e2c5a852addc9a?sid=43dc1fb0-5232-43c5-85d5-e723412cce1d)](https://www.loom.com/share/19e0e79b20e6441e87e2c5a852addc9a?sid=43dc1fb0-5232-43c5-85d5-e723412cce1d)

## Introduction

This project is an email automation tool built for ReachInbox.ai as part of an assignment for the position of Associate - Backend Engineer. The tool parses and checks emails in Google and Outlook accounts, categorizes them based on content, and responds automatically using AI. It utilizes BullMQ for task scheduling, Google OAuth for authentication, and the Gemini API for email context understanding and automatic replies.

## Features

- OAuth Authentication for Gmail and Outlook accounts
- Email parsing using the Gemini API
- Email categorization: Interested, Not Interested, and More Information
- Automated replies based on email content
- Task scheduling with BullMQ for checking new emails every minute

## Technologies Used

- Node.js
- Express.js
- Google APIs (OAuth, Gmail)
- BullMQ
- Google Generative AI (Gemini API)

## Prerequisites

- Node.js (v14.x or higher)
- npm (v6.x or higher)
- Google API credentials
- Gemini API key

## Setup and Installation

1. Clone the Repository:
   ```bash
   git clone https://github.com/Bimal022/AutoMailAI.git

2. Install Dependencies:

    ```bash
    npm install

3. Configure Environment Variables:
Create a .env file in the root directory with the following:

    ```bash
    CLIENT_ID=your_google_client_id
    CLIENT_SECRET=your_google_client_secret
    REDIRECT_URI=your_google_redirect_uri
    GEMINI_API_KEY=your_gemini_api_key

4. Run the Server:

    ```bash
    node app.js

5. Usage

Authenticate with Google:

Navigate to http://localhost:3000/auth
Follow the prompts and save the tokens


6. Send a Test Email:

Send an email to the authenticated account from another email address


7. Check Emails and Send Auto Replies:

The tool automatically checks for new emails every minute
It categorizes emails and sends appropriate replies


## Note

Ensure the Gmail API is enabled in your Google Cloud Console

