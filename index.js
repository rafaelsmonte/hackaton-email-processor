const AWS = require("aws-sdk");
const AmazonCognitoIdentity = require("amazon-cognito-identity-js");

const ses = new AWS.SES();
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

class CustomError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

exports.handler = async (event) => {
  console.log("event:");
  console.log(event);

  try {
    for (const record of event.Records) {
      if (record.EventSource === "aws:sns") {
        const snsMessage = record.Sns.Message;

        const message = JSON.parse(snsMessage);

        console.log("Message received: ", message);

        let subject;
        let emailBody;
        let userEmail;

        const type = message.type;
        const sender = message.sender;
        const target = message.target;
        const payload = message.payload;

        if (sender === "VIDEO_API_SERVICE" && target === "EMAIL_SERVICE") {
          if (type === "MSG_SEND_SNAPSHOT_EXTRACTION_SUCCESS") {
            subject = "Video Processing Success";
            emailBody = `\nVideo Description: ${payload["videoDescription"]}\nVideo URL: ${payload["videoUrl"]}\nVideo Snapshots URL: ${payload["videoSnapshotsUrl"]}`;
          } else if (type === "MSG_SEND_SNAPSHOT_EXTRACTION_ERROR") {
            subject = "Video Processing Error";
            emailBody = `\nVideo Description: ${payload["videoDescription"]}\nError message: ${payload["errorMessage"]}\nError description: ${payload["errorDescription"]}`;
          } else {
            console.error("Unknown message type");
            continue;
          }

          try {
            userEmail = await getUserEmail(payload["userId"]);
          } catch (error) {
            console.error("Error getting user: ", error);
            continue;
          }

          const fromEmail = process.env.SENDER_EMAIL;
          const toEmail = userEmail;

          const params = {
            Source: fromEmail,
            Destination: {
              ToAddresses: [toEmail],
            },
            Message: {
              Subject: {
                Data: subject,
              },
              Body: {
                Text: {
                  Data: emailBody,
                },
              },
            },
          };

          console.log("Email message params: ", params);
          console.log("Email body: ", emailBody);

          const result = await ses.sendEmail(params).promise();
          console.log("Email sent successfully: ", result);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Event processed successfully" }),
    };
  } catch (error) {
    console.error("Error processing event: ", error);
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        error: error.message || "Internal Server Error",
      }),
    };
  }
};

async function getUserEmail(userId) {
  try {
    const params = {
      UserPoolId: process.env.USER_POOL_ID,
      Filter: `sub = "${userId}"`,
    };

    const data = await cognitoIdentityServiceProvider
      .listUsers(params)
      .promise();

    if (data.Users && data.Users.length > 0) {
      return data.Users[0].Username;
    }

    throw new CustomError("User not found", 404);
  } catch (error) {
    console.error("Error getting user by sub: ", error);
    throw error; // Re-throw errors for further handling
  }
}
