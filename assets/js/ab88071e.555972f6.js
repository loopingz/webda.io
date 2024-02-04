"use strict";(self.webpackChunk_webda_docs=self.webpackChunk_webda_docs||[]).push([[38944],{6588:(e,n,o)=>{o.r(n),o.d(n,{assets:()=>l,contentTitle:()=>r,default:()=>u,frontMatter:()=>a,metadata:()=>s,toc:()=>d});var t=o(17624),i=o(4552);const a={sidebar_label:"@webda/google-auth"},r="google-auth",s={id:"Modules/google-auth/README",title:"google-auth",description:"Summary",source:"@site/pages/Modules/google-auth/README.md",sourceDirName:"Modules/google-auth",slug:"/Modules/google-auth/",permalink:"/docs/Modules/google-auth/",draft:!1,unlisted:!1,editUrl:"https://github.com/loopingz/webda.io/tree/docs/pages/Modules/google-auth/README.md",tags:[],version:"current",frontMatter:{sidebar_label:"@webda/google-auth"},sidebar:"sidebar",previous:{title:"@webda/gcp",permalink:"/docs/Modules/gcp/"},next:{title:"@webda/hawk",permalink:"/docs/Modules/hawk/"}},l={},d=[{value:"Summary",id:"summary",level:2},{value:"Quickstart",id:"quickstart",level:2},{value:"Create a project",id:"create-a-project",level:4},{value:"Create a new module if you have a multi modules",id:"create-a-new-module-if-you-have-a-multi-modules",level:4},{value:"Create a new service",id:"create-a-new-service",level:4},{value:"Create a new model",id:"create-a-new-model",level:4},{value:"Run it",id:"run-it",level:4},{value:"Documentation",id:"documentation",level:2},{value:"Configuration resolution",id:"configuration-resolution",level:2},{value:"History",id:"history",level:2},{value:"Requirements",id:"requirements",level:2}];function c(e){const n={a:"a",code:"code",h1:"h1",h2:"h2",h4:"h4",p:"p",pre:"pre",strong:"strong",...(0,i.M)(),...e.components};return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(n.h1,{id:"google-auth",children:"google-auth"}),"\n",(0,t.jsx)(n.h2,{id:"summary",children:"Summary"}),"\n",(0,t.jsx)(n.p,{children:"Webda is a framework that provides a dependencies injection system, model-driven applications with multidatabase abstraction and deployment strategy that includes Lambda/APIGateway, Kubernetes."}),"\n",(0,t.jsx)(n.p,{children:"Even if the framework can do all the steps of deployment, it can also be decoupled to fit inside your classic CI workflow using Github Actions, Bazel, Jenkins, ..."}),"\n",(0,t.jsxs)(n.p,{children:["The framework in its latest version moved to a Domain-driven design: design your ",(0,t.jsx)(n.code,{children:"Models"})," and their actions, permissions. For specific behavior that are not Models specific, you can create and use Beans. The framework can then expose everything as REST API, or GraphQL or CommandLine."]}),"\n",(0,t.jsx)(n.h2,{id:"quickstart",children:"Quickstart"}),"\n",(0,t.jsxs)(n.p,{children:["You should checkout our demo project : ",(0,t.jsx)(n.a,{href:"https://github.com/loopingz/webda.io/sample-app/",children:"link"})]}),"\n",(0,t.jsx)(n.h4,{id:"create-a-project",children:"Create a project"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{children:"npx @webda/shell init\n"})}),"\n",(0,t.jsx)(n.h4,{id:"create-a-new-module-if-you-have-a-multi-modules",children:"Create a new module if you have a multi modules"}),"\n",(0,t.jsx)(n.p,{children:"Inside your project, just launch:"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{children:"yarn new-module\n"})}),"\n",(0,t.jsx)(n.h4,{id:"create-a-new-service",children:"Create a new service"}),"\n",(0,t.jsx)(n.p,{children:"Inside your package, just launch:"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{children:"yarn new-service\n"})}),"\n",(0,t.jsx)(n.h4,{id:"create-a-new-model",children:"Create a new model"}),"\n",(0,t.jsx)(n.p,{children:"Inside your package, just launch:"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{children:"yarn new-model\n"})}),"\n",(0,t.jsx)(n.h4,{id:"run-it",children:"Run it"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{children:"webda serve\n"})}),"\n",(0,t.jsx)(n.p,{children:"Or in debug mode with hot reload"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{children:"webda debug\n"})}),"\n",(0,t.jsx)(n.h2,{id:"documentation",children:"Documentation"}),"\n",(0,t.jsxs)(n.p,{children:["You can find the Javascript documentation on ",(0,t.jsx)(n.a,{href:"https://docs.webda.io",children:"https://docs.webda.io"})]}),"\n",(0,t.jsx)(n.h2,{id:"configuration-resolution",children:"Configuration resolution"}),"\n",(0,t.jsx)(n.p,{children:"To ease up the configuration of an application we came up with the following configuration resolution schema."}),"\n",(0,t.jsx)(n.p,{children:"You have the global configuration for the application, that is override by the deployment configuration, that is override by the local element configuration, and finally, override by the deployment element configuration."}),"\n",(0,t.jsx)(n.h2,{id:"history",children:"History"}),"\n",(0,t.jsxs)(n.p,{children:["Back in 2014, I had servers running for my own personal use for more than 10 years because I wanted to have few websites and APIs online, but most of the time those servers are sitting and waiting. Then came ",(0,t.jsx)(n.strong,{children:"Lambda"}),", really cool feature from AWS, but it was tricky to turn it into a full webserver. That's one of the targets of Webda."]}),"\n",(0,t.jsx)(n.p,{children:"Since AWS became better with nice framework like Amplify or Serverless. Webda stayed useful as it does provide a true framework of development with some vague inspiration from Spring. It does the heavy lifting for you to abstract NoSQL, to abstract the run environment (Lambda or Kubernetes or custom)"}),"\n",(0,t.jsxs)(n.p,{children:["The ",(0,t.jsx)(n.strong,{children:"webda.config.json"})," contains the configuration of the app, defining Services, Routes, and global configuration, you can consider it as the applicationContext.xml of Spring if you prefer, with Beans=Services"]}),"\n",(0,t.jsx)(n.h2,{id:"requirements",children:"Requirements"}),"\n",(0,t.jsx)(n.p,{children:"Node.js >= 18.0.0"})]})}function u(e={}){const{wrapper:n}={...(0,i.M)(),...e.components};return n?(0,t.jsx)(n,{...e,children:(0,t.jsx)(c,{...e})}):c(e)}},4552:(e,n,o)=>{o.d(n,{I:()=>s,M:()=>r});var t=o(11504);const i={},a=t.createContext(i);function r(e){const n=t.useContext(a);return t.useMemo((function(){return"function"==typeof e?e(n):{...n,...e}}),[n,e])}function s(e){let n;return n=e.disableParentContext?"function"==typeof e.components?e.components(i):e.components||i:r(e.components),t.createElement(a.Provider,{value:n},e.children)}}}]);