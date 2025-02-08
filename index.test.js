const { handler } = require("./index"); // Update the path to your Lambda file
const AWS = require("aws-sdk");
const AmazonCognitoIdentity = require("amazon-cognito-identity-js");

process.env.AWS_REGION = "us-east-1";
process.env.SENDER_EMAIL = "sender@example.com";
process.env.USER_POOL_ID = "test-user-pool-id";
process.env.CLIENT_ID = "test-client-id";
process.env.AWS_ACCESS_KEY_ID = "mockAccessKey";
process.env.AWS_SECRET_ACCESS_KEY = "mockSecretKey";

// Mock AWS SDK and Cognito
jest.mock("aws-sdk");
jest.mock("amazon-cognito-identity-js");

describe("Lambda Handler", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it("should process a success message and send an email", async () => {
    // Mock event with a success message
    const event = {
      Records: [
        {
          EventSource: "aws:sns",
          Sns: {
            Message: JSON.stringify({
              type: "MSG_SEND_SNAPSHOT_EXTRACTION_SUCCESS",
              sender: "VIDEO_API_SERVICE",
              target: "EMAIL_SERVICE",
              payload: {
                userId: "user-123",
                videoDescription: "Test Video",
                videoUrl: "http://example.com/video",
                videoSnapshotsUrl: "http://example.com/snapshots",
              },
            }),
          },
        },
      ],
    };

    // Mock Cognito to return a user
    AWS.CognitoIdentityServiceProvider.prototype.listUsers = jest
      .fn()
      .mockImplementation(() => ({
        promise: jest.fn().mockResolvedValue({
          Users: [
            {
              Username: "user@example.com", // Ensure this matches the expected structure
              Attributes: [
                { Name: "sub", Value: "user-123" },
                { Name: "email", Value: "user@example.com" },
              ],
            },
          ],
        }),
      }));

    // Mock SES to simulate sending an email successfully
    AWS.SES.prototype.sendEmail = jest.fn().mockImplementation(() => ({
      promise: jest.fn().mockResolvedValue({ MessageId: "mock-message-id" }),
    }));

    // Call the handler
    const result = await handler(event);

    console.log("result test: ", result);

    // Assertions
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: "Event processed successfully",
    });

    // Verify SES was called with the correct parameters
    expect(AWS.SES.prototype.sendEmail).toHaveBeenCalledWith({
      Source: "sender@example.com",
      Destination: {
        ToAddresses: ["user@example.com"], // Ensure this matches the expected email
      },
      Message: {
        Subject: {
          Data: "Video Processing Success",
        },
        Body: {
          Text: {
            Data: "\nVideo Description: Test Video\nVideo URL: http://example.com/video\nVideo Snapshots URL: http://example.com/snapshots",
          },
        },
      },
    });
  });

  it("should process an error message and send an email", async () => {
    // Mock event with an error message
    const event = {
      Records: [
        {
          EventSource: "aws:sns",
          Sns: {
            Message: JSON.stringify({
              type: "MSG_SEND_SNAPSHOT_EXTRACTION_ERROR",
              sender: "VIDEO_API_SERVICE",
              target: "EMAIL_SERVICE",
              payload: {
                userId: "user-123",
                videoDescription: "Test Video",
                errorMessage: "Processing failed",
                errorDescription: "An error occurred",
              },
            }),
          },
        },
      ],
    };

    // Mock Cognito to return a user
    AWS.CognitoIdentityServiceProvider.prototype.listUsers = jest
      .fn()
      .mockImplementation(() => ({
        promise: jest.fn().mockResolvedValue({
          Users: [
            {
              Username: "user@example.com", // Ensure this matches the expected structure
              Attributes: [
                { Name: "sub", Value: "user-123" },
                { Name: "email", Value: "user@example.com" },
              ],
            },
          ],
        }),
      }));

    // Mock SES to simulate sending an email successfully
    AWS.SES.prototype.sendEmail = jest.fn().mockImplementation(() => ({
      promise: jest.fn().mockResolvedValue({ MessageId: "mock-message-id" }),
    }));

    // Call the handler
    const result = await handler(event);

    // Assertions
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: "Event processed successfully",
    });

    // Verify SES was called with the correct parameters
    expect(AWS.SES.prototype.sendEmail).toHaveBeenCalledWith({
      Source: "sender@example.com",
      Destination: {
        ToAddresses: ["user@example.com"], // Ensure this matches the expected email
      },
      Message: {
        Subject: {
          Data: "Video Processing Error",
        },
        Body: {
          Text: {
            Data: "\nVideo Description: Test Video\nError message: Processing failed\nError description: An error occurred",
          },
        },
      },
    });
  });

  it("should skip unknown message types", async () => {
    // Mock event with an unknown message type
    const event = {
      Records: [
        {
          EventSource: "aws:sns",
          Sns: {
            Message: JSON.stringify({
              type: "UNKNOWN_TYPE",
              sender: "VIDEO_API_SERVICE",
              target: "EMAIL_SERVICE",
              payload: {},
            }),
          },
        },
      ],
    };

    // Call the handler
    const result = await handler(event);

    // Assertions
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: "Event processed successfully",
    });

    // Verify SES was not called
    expect(AWS.SES.prototype.sendEmail).not.toHaveBeenCalled();
  });

  it("should handle user not found in Cognito", async () => {
    // Mock event with a success message
    const event = {
      Records: [
        {
          EventSource: "aws:sns",
          Sns: {
            Message: JSON.stringify({
              type: "MSG_SEND_SNAPSHOT_EXTRACTION_SUCCESS",
              sender: "VIDEO_API_SERVICE",
              target: "EMAIL_SERVICE",
              payload: {
                userId: "user-123",
                videoDescription: "Test Video",
                videoUrl: "http://example.com/video",
                videoSnapshotsUrl: "http://example.com/snapshots",
              },
            }),
          },
        },
      ],
    };

    // Mock Cognito to return no users
    AWS.CognitoIdentityServiceProvider.prototype.listUsers = jest
      .fn()
      .mockImplementation(() => ({
        promise: jest.fn().mockResolvedValue({ Users: [] }),
      }));

    // Call the handler
    const result = await handler(event);

    // Assertions
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: "Event processed successfully",
    });

    // Verify SES was not called
    expect(AWS.SES.prototype.sendEmail).not.toHaveBeenCalled();
  });

  it("should handle errors when sending email via SES", async () => {
    // Mock event with a success message
    const event = {
      Records: [
        {
          EventSource: "aws:sns",
          Sns: {
            Message: JSON.stringify({
              type: "MSG_SEND_SNAPSHOT_EXTRACTION_SUCCESS",
              sender: "VIDEO_API_SERVICE",
              target: "EMAIL_SERVICE",
              payload: {
                userId: "user-123",
                videoDescription: "Test Video",
                videoUrl: "http://example.com/video",
                videoSnapshotsUrl: "http://example.com/snapshots",
              },
            }),
          },
        },
      ],
    };

    // Mock Cognito to return a user
    AWS.CognitoIdentityServiceProvider.prototype.listUsers = jest
      .fn()
      .mockImplementation(() => ({
        promise: jest.fn().mockResolvedValue({
          Users: [
            {
              Username: "user@example.com", // Ensure this matches the expected structure
              Attributes: [
                { Name: "sub", Value: "user-123" },
                { Name: "email", Value: "user@example.com" },
              ],
            },
          ],
        }),
      }));

    // Mock SES to throw an error
    AWS.SES.prototype.sendEmail = jest.fn().mockImplementation(() => ({
      promise: jest.fn().mockRejectedValue(new Error("SES error")),
    }));

    // Call the handler
    const result = await handler(event);

    // Assertions
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      error: "SES error",
    });
  });

  it("should skip sending email if user is not found", async () => {
    // Mock event with a success message
    const event = {
      Records: [
        {
          EventSource: "aws:sns",
          Sns: {
            Message: JSON.stringify({
              type: "MSG_SEND_SNAPSHOT_EXTRACTION_SUCCESS",
              sender: "VIDEO_API_SERVICE",
              target: "EMAIL_SERVICE",
              payload: {
                userId: "user-123",
                videoDescription: "Test Video",
                videoUrl: "http://example.com/video",
                videoSnapshotsUrl: "http://example.com/snapshots",
              },
            }),
          },
        },
      ],
    };

    // Mock Cognito to return no users
    AWS.CognitoIdentityServiceProvider.prototype.listUsers = jest
      .fn()
      .mockImplementation(() => ({
        promise: jest.fn().mockResolvedValue({ Users: [] }),
      }));

    // Call the handler
    const result = await handler(event);

    // Assertions
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: "Event processed successfully",
    });

    // Verify SES was not called
    expect(AWS.SES.prototype.sendEmail).not.toHaveBeenCalled();
  });
});
