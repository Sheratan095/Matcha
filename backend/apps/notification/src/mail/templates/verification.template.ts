export const verificationEmailTemplate = (link: string) => `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            .button {
                background-color: #4CAF50;
                border: none;
                color: white;
                padding: 15px 32px;
                text-align: center;
                text-decoration: none;
                display: inline-block;
                font-size: 16px;
                margin: 4px 2px;
                cursor: pointer;
            }
        </style>
    </head>
    <body>
        <h1>Welcome to Matcha!</h1>
        <p>Please click the button below to verify your email address:</p>
        <a href="${link}" class="button">Verify Email</a>
    </body>
    </html>
`;
