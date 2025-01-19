const AWS = require("aws-sdk");
const ses = new AWS.SES({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  console.log("event body:");
  console.log(event.body);

  try {
    let body;

    if (typeof event.body === "string") {
      try {
        body = JSON.parse(event.body);
      } catch (error) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Invalid JSON format" }),
        };
      }
    } else {
      body = event.body;
    }

    // TODO handle notification from sns topic
    const { sender, target, type, payload } = body;

    let subject;
    let emailBody;

    if (type === "MSG_SEND_SNAPSHOT_EXTRACTION_SUCCESS") {
      subject = "Video Processing Success";
      emailBody = `Video Description:${payload["videoDescription"]}\nVideo URL: ${payload["videoUrl"]}\nVideo Snapshots URL: ${payload["videoSnapshotsUrl"]}`;
    } else if (type === "MSG_SEND_SNAPSHOT_EXTRACTION_ERROR") {
      subject = "Video Processing Error";
      emailBody = `Video Description:${payload["videoDescription"]}\Error message: ${payload["errorMessage"]}\nError description: ${payload["errorDescription"]}`;
    } else {
      console.error("Unknown message type");
      return;
    }

    const user = await getUser(payload["userId"]);

    if (!user) {
      return;
    }

    const fromEmail = "sender@example.com"; // Must be verified in SES if in sandbox
    const toEmail = user.getUsername(); // Must be verified in SES if in sandbox

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

    const result = await ses.sendEmail(params).promise();
    console.log("Email sent successfully:", result);
  } catch (error) {
    console.error("An error has occurred: ");
    console.error(error);
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

    console.error("User not found");
    return null;
  } catch (error) {
    console.error("Error getting user by sub: ", error);
    throw error; // Re-throw errors for further handling
  }
}
