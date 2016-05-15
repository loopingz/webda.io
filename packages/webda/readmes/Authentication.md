# Authentication

The Authentication service highly depends on [PassportJS](http://passportjs.org/) this is why its file is passport.js

It requires two stores : Idents and Users.

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
this.emit("Register", {"user": user, "datas": datas});
```

## Email authentication

To use this feature you need to have a configured Mailer service, you can define the service name by adding the field mailer inside the email configuration.

The email authentication has two modes, one that register the user without waiting for the email validation, and the other one that register the user only when the registration form contains the right validation token sent by email.


```javascript
...
"providers": {
  "email": {
     "from": "", // Email sender
     "subject": "", // Email subject
     "html": "", // HTML to send by email for email validation
     "text": "", // Text to send by email for email validation
     "mailer": "DefinedMailer", // Defined mailer to use
     "postValidation": false // If true, create user without email validation
  },
}
...
```

The email authentication expose 
POST /auth/email
if the body contains register=true then it will perform registration, if not then only login returning 404 if unknown user, 403 for bad password, 204 for successful login
GET /auth/callback

## OAuth

You can setup differents types of OAuth, we integrate for now only Facebook, Amazon, Twitter, GitHub, Google.

```javascript
{
  ...
  providers: {
    facebook: {
      clientID: "facebookClientId",
      clientSecret: "facebookSecret",
      scope: ["email","public_profile"]
    }
  }
  ...
}
```

This is the same for the other providers, except **Twitter** where the fields are OAuth1 : consumerKey and consumerSecret

## Polymer

You have a Polymer behavior that implement the Authentication : ...

