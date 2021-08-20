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
POST /auth/email
if the body contains register=true then it will perform registration, if not then only login returning 404 if unknown user, 403 for bad password, 204 for successful login
GET /auth/callback

## OAuth

You can setup differents types of OAuth, through other modules like `google-auth`
