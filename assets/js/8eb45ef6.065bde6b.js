"use strict";(self.webpackChunk_webda_docs=self.webpackChunk_webda_docs||[]).push([[16550],{9184:(e,i,n)=>{n.r(i),n.d(i,{assets:()=>l,contentTitle:()=>o,default:()=>h,frontMatter:()=>r,metadata:()=>a,toc:()=>d});var t=n(17624),s=n(4552);const r={},o="Authentication",a={id:"Modules/core/Authentication/Authentication",title:"Authentication",description:"The Authentication service allows you to define User and Ident within your application.",source:"@site/pages/Modules/core/Authentication/Authentication.md",sourceDirName:"Modules/core/Authentication",slug:"/Modules/core/Authentication/",permalink:"/docs/Modules/core/Authentication/",draft:!1,unlisted:!1,editUrl:"https://github.com/loopingz/webda.io/tree/docs/pages/Modules/core/Authentication/Authentication.md",tags:[],version:"current",frontMatter:{},sidebar:"sidebar",previous:{title:"@webda/core",permalink:"/docs/Modules/core/"},next:{title:"Apple",permalink:"/docs/Modules/core/Authentication/Apple"}},l={},d=[{value:"Register event",id:"register-event",level:2},{value:"Email authentication",id:"email-authentication",level:2},{value:"OAuth",id:"oauth",level:2}];function c(e){const i={code:"code",h1:"h1",h2:"h2",li:"li",p:"p",pre:"pre",ul:"ul",...(0,s.M)(),...e.components};return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(i.h1,{id:"authentication",children:"Authentication"}),"\n",(0,t.jsx)(i.p,{children:"The Authentication service allows you to define User and Ident within your application.\nIf needed, you can simply connect your application with an {@link OAuthService} implementation like Google Authentication, and use their uuid."}),"\n",(0,t.jsx)(i.p,{children:"A User can have several Idents as you can identify with email, mobile, external services like Google or Facebook or any other trusted services."}),"\n",(0,t.jsx)(i.p,{children:"To store the Users and Idents it requires two stores."}),"\n",(0,t.jsx)(i.p,{children:"The Idents will contains each mode of Authentication enabled by the user, you will find in the Ident also the profile returned by the OAuth provider if returned."}),"\n",(0,t.jsx)(i.p,{children:"The Users will have one object per user, with the idents collection, it also contains the password if any is set."}),"\n",(0,t.jsx)(i.p,{children:"Basic configuration"}),"\n",(0,t.jsx)(i.pre,{children:(0,t.jsx)(i.code,{className:"language-javascript",metastring:'title="webda.config.json"',children:'"successRedirect": "https://shootandprove.loopingz.com/user.html", // Redirect to this page after login\n"failureRedirect": "/login-error", // Redirect to this page after failed login\n"registerRedirect": "/login-error", // Redirect to this page after email is validated\n"userStore": "", // If you want to override the userStore name by default Users\n"identStore": "", // If you want to override the identStore name by default Idents\n"providers": {\n  ... // See below\n}\n'})}),"\n",(0,t.jsx)(i.h2,{id:"register-event",children:"Register event"}),"\n",(0,t.jsx)(i.p,{children:"When a user register, the Authentication service send a Register event, so you can complete the user with additional informations."}),"\n",(0,t.jsx)(i.pre,{children:(0,t.jsx)(i.code,{className:"language-javascript",children:'// Datas is the profile coming from the OAuth or the Register form\nthis.emit("Register", \\{ user: user, datas: datas, ctx: ctx });\n'})}),"\n",(0,t.jsx)(i.h2,{id:"email-authentication",children:"Email authentication"}),"\n",(0,t.jsx)(i.p,{children:"To use this feature you need to have a configured Mailer service, you can define the service name by adding the field mailer inside the email configuration."}),"\n",(0,t.jsx)(i.p,{children:"The email authentication has two modes, one that register the user without waiting for the email validation, and the other one that register the user only when the registration form contains the right validation token sent by email."}),"\n",(0,t.jsx)(i.pre,{children:(0,t.jsx)(i.code,{className:"language-javascript",metastring:'title="webda.config.json"',children:'...\n"email": {\n    "from": "", // Email sender\n    "subject": "", // Email subject\n    "html": "", // HTML to send by email for email validation\n    "text": "", // Text to send by email for email validation\n    "mailer": "DefinedMailer", // Defined mailer to use\n    "postValidation": false, // If true, create user without email validation\n    "skipEmailValidation": true // Don\'t even send a validation email, must be set along with postValidation=true\n},\n...\n'})}),"\n",(0,t.jsx)(i.p,{children:"The email authentication expose"}),"\n",(0,t.jsx)(i.p,{children:(0,t.jsx)(i.code,{children:"POST /auth/email"})}),"\n",(0,t.jsx)(i.p,{children:"The body of the request looks like:"}),"\n",(0,t.jsx)(i.pre,{children:(0,t.jsx)(i.code,{children:'{\n  "login": "myemail@webda.io",\n  "password": "mypass",\n  "register": true,\n  "token": "myEmailToken",\n  ...\n}\n'})}),"\n",(0,t.jsxs)(i.p,{children:["With ",(0,t.jsx)(i.code,{children:"register=true"})," in the body:"]}),"\n",(0,t.jsxs)(i.ul,{children:["\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"204"}),": Registration done or pending (depending on postValidation and body)"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"400"}),": Bad request: either missing arguments or password invalid"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"409"}),": Login already used"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"410"}),": User already logged in"]}),"\n"]}),"\n",(0,t.jsxs)(i.p,{children:["With ",(0,t.jsx)(i.code,{children:"register=false|undefined"}),":"]}),"\n",(0,t.jsxs)(i.ul,{children:["\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"204"}),": Successful login"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"403"}),": Bad password"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"404"}),": Unknown user"]}),"\n"]}),"\n",(0,t.jsxs)(i.p,{children:[(0,t.jsx)(i.code,{children:"GET /auth/me"}),": returns current user"]}),"\n",(0,t.jsxs)(i.p,{children:[(0,t.jsx)(i.code,{children:"GET /auth"}),": returns available authentication"]}),"\n",(0,t.jsxs)(i.p,{children:[(0,t.jsx)(i.code,{children:"DELETE /auth"}),": logout"]}),"\n",(0,t.jsxs)(i.p,{children:[(0,t.jsx)(i.code,{children:"GET /auth/email/callback"}),": Callback url to validate email, will redirect to another page"]}),"\n",(0,t.jsxs)(i.ul,{children:["\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"successRedirect"}),": if email is valid and nothing else to do"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"registerRedirect"}),": if email is valid but still require to finish the registration process"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"failureRedirect?reason=badUser"}),": if user logged in is different from the user who started the process"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"failureRedirect?reason=badToken"}),": if validation token is invalid"]}),"\n"]}),"\n",(0,t.jsxs)(i.p,{children:[(0,t.jsx)(i.code,{children:"GET /auth/email/\\{email}/recover"}),": start the password reset process by sending an email"]}),"\n",(0,t.jsxs)(i.ul,{children:["\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"204"}),": Sucessfuly sent recovery email"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"404"}),": Email does not exist"]}),"\n",(0,t.jsxs)(i.li,{children:[(0,t.jsx)(i.code,{children:"429"}),": Recovery has been sent recently"]}),"\n"]}),"\n",(0,t.jsxs)(i.p,{children:[(0,t.jsx)(i.code,{children:"POST /auth/email/passwordRecovery"}),": finish the password reset process"]}),"\n",(0,t.jsxs)(i.p,{children:[(0,t.jsx)(i.code,{children:"GET /auth/email/\\{email}/validate"}),": start the password validation process by sending an email"]}),"\n",(0,t.jsx)(i.h2,{id:"oauth",children:"OAuth"}),"\n",(0,t.jsxs)(i.p,{children:["You can setup differents types of OAuth, through other modules like ",(0,t.jsx)(i.code,{children:"google-auth"})]})]})}function h(e={}){const{wrapper:i}={...(0,s.M)(),...e.components};return i?(0,t.jsx)(i,{...e,children:(0,t.jsx)(c,{...e})}):c(e)}},4552:(e,i,n)=>{n.d(i,{I:()=>a,M:()=>o});var t=n(11504);const s={},r=t.createContext(s);function o(e){const i=t.useContext(r);return t.useMemo((function(){return"function"==typeof e?e(i):{...i,...e}}),[i,e])}function a(e){let i;return i=e.disableParentContext?"function"==typeof e.components?e.components(s):e.components||s:o(e.components),t.createElement(r.Provider,{value:i},e.children)}}}]);