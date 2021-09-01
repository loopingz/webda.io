# Authentication

The Authentication service allows you to define User and Ident within your application.
If needed, you can simply connect your application with an {@link OAuthService} implementation like Google Authentication, and use their uuid.

A User can have several Idents as you can identify with email, mobile, external services like Google or Facebook or any other trusted services.

To store the Users and Idents it requires two stores.

The Idents will contains each mode of Authentication enabled by the user, you will find in the Ident also the profile returned by the OAuth provider if returned.

The Users will have one object per user, with the idents collection, it also contains the password if any is set.

Basic configuration

```javascript
"successRedirect": "https://shootandprove.loopingz.com/user.html", // Redirect to this page after login
"failureRedirect": "/login-error", // Redirect to this page after failed login
"registerRedirect": "/login-error", // Redirect to this page after email is validated
"userStore": "", // If you want to override the userStore name by default Users
"identStore": "", // If you want to override the identStore name by default Idents
"providers": {
  ... // See below
}
```

## Register event

When a user register, the Authentication service send a Register event, so you can complete the user with additional informations.

```javascript
// Datas is the profile coming from the OAuth or the Register form
this.emit("Register", { user: user, datas: datas, ctx: ctx });
```

## Email authentication

To use this feature you need to have a configured Mailer service, you can define the service name by adding the field mailer inside the email configuration.

The email authentication has two modes, one that register the user without waiting for the email validation, and the other one that register the user only when the registration form contains the right validation token sent by email.

```javascript
...
"email": {
    "from": "", // Email sender
    "subject": "", // Email subject
    "html": "", // HTML to send by email for email validation
    "text": "", // Text to send by email for email validation
    "mailer": "DefinedMailer", // Defined mailer to use
    "postValidation": false, // If true, create user without email validation
    "skipEmailValidation": true // Don't even send a validation email, must be set along with postValidation=true
},
...
```

The email authentication expose

`POST /auth/email`

The body of the request looks like:

```
{
  "login": "myemail@webda.io",
  "password": "mypass",
  "register": true,
  "token": "myEmailToken",
  ...
}
```

With `register=true` in the body:

- `204`: Registration done or pending (depending on postValidation and body)
- `400`: Bad request: either missing arguments or password invalid
- `409`: Login already used

With `register=false|undefined`:

- `204`: Successful login
- `403`: Bad password
- `404`: Unknown user

`GET /auth/me`: returns current user

`GET /auth`: returns available authentication

`DELETE /auth`: logout

`GET /auth/email/callback`: Callback url to validate email, will redirect to another page

- `successRedirect`: if email is valid and nothing else to do
- `registerRedirect`: if email is valid but still require to finish the registration process
- `failureRedirect?reason=badUser`: if user logged in is different from the user who started the process
- `failureRedirect?reason=badToken`: if validation token is invalid

`GET /auth/email/{email}/recover`: start the password reset process by sending an email

`POST /auth/email/passwordRecovery`: finish the password reset process

`GET /auth/email/{email}/validate`: start the password validation process by sending an email

## OAuth

You can setup differents types of OAuth, through other modules like `google-auth`
