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

// TODO allow this permission: AccessDenied: User `arn:aws:sts::347116569372:assumed-role/LabRole/email-processor' is not authorized to perform `ses:SendEmail' on resource `arn:aws:ses:us-east-1:347116569372:identity/sender@example.com'

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
        let user;

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
            user = await getUser(payload["userId"]);
          } catch (error) {
            continue;
          }

          const fromEmail = "sender@example.com"; // TODO ??
          const toEmail = user.getUsername();

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

async function getUser(userId) {
  try {
    const params = {
      UserPoolId: process.env.USER_POOL_ID,
      Filter: `sub = "${userId}"`,
    };

    const data = await cognitoIdentityServiceProvider
      .listUsers(params)
      .promise();

    if (data.Users && data.Users.length > 0) {
      const user = data.Users[0];

      const userData = {
        Username: user.Username,
        Pool: new AmazonCognitoIdentity.CognitoUserPool({
          UserPoolId: process.env.USER_POOL_ID,
          ClientId: process.env.CLIENT_ID,
        }),
      };

      return new AmazonCognitoIdentity.CognitoUser(userData);
    }

    throw new CustomError("User not found", 404);
  } catch (error) {
    console.error("Error getting user by sub: ", error);
    throw error; // Re-throw errors for further handling
  }
}
