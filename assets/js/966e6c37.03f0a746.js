"use strict";(self.webpackChunk_webda_docs=self.webpackChunk_webda_docs||[]).push([[83336],{93852:(e,n,i)=>{i.r(n),i.d(n,{assets:()=>l,contentTitle:()=>o,default:()=>h,frontMatter:()=>t,metadata:()=>a,toc:()=>d});var s=i(17624),r=i(4552);const t={sidebar_position:2},o="Concepts",a={id:"Concepts/Concepts",title:"Concepts",description:"Webda is a domain driven framework.",source:"@site/pages/Concepts/Concepts.md",sourceDirName:"Concepts",slug:"/Concepts/",permalink:"/docs/Concepts/",draft:!1,unlisted:!1,editUrl:"https://github.com/loopingz/webda.io/tree/docs/pages/Concepts/Concepts.md",tags:[],version:"current",sidebarPosition:2,frontMatter:{sidebar_position:2},sidebar:"sidebar",previous:{title:"Glossary",permalink:"/docs/Glossary"},next:{title:"Application",permalink:"/docs/Concepts/Application"}},l={},d=[{value:"Under the hood",id:"under-the-hood",level:2},{value:"Services",id:"services",level:2},{value:"Parameters",id:"parameters",level:3},{value:"Routes",id:"routes",level:2},{value:"Retrieve parameters",id:"retrieve-parameters",level:3},{value:"Deployment",id:"deployment",level:2},{value:"Application",id:"application",level:2},{value:"Modules",id:"modules",level:2},{value:"Shell module",id:"shell-module",level:3}];function c(e){const n={code:"code",h1:"h1",h2:"h2",h3:"h3",li:"li",p:"p",pre:"pre",ul:"ul",...(0,r.M)(),...e.components};return(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(n.h1,{id:"concepts",children:"Concepts"}),"\n",(0,s.jsx)(n.p,{children:"Webda is a domain driven framework."}),"\n",(0,s.jsx)(n.p,{children:"It means you should mainly focus on creating your business models."}),"\n",(0,s.jsx)(n.p,{children:"Then Services exists to implement generic features:"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:"Store your models: Store, DynamoDB, MongoDB, Postgresql, Firebase, Memory, File"}),"\n",(0,s.jsx)(n.li,{children:"Store your binaries: BinaryService, FileBinary, S3Binary, GCPStorage"}),"\n",(0,s.jsx)(n.li,{children:"Expose your models: DomainService, GraphQLService"}),"\n",(0,s.jsx)(n.li,{children:"Authenticatate: AuthenticationService, OAuthService"}),"\n",(0,s.jsx)(n.li,{children:"Secure: Hawk, built-in sanitizer"}),"\n"]}),"\n",(0,s.jsx)(n.p,{children:"You usually have needs for a few additional services that are unrelated to business models like integration with third parties.\nTo tackle this, create your Service or Bean.\nA Service is designed to be reusable, where a Bean is a singeleton in your application and not designed to be reused elsewhere."}),"\n",(0,s.jsx)(n.p,{children:"Althought there are other mechanisms we recommend using the annotations within the app to declare: @Bean, @Route, @Operation, @Action"}),"\n",(0,s.jsx)(n.p,{children:"Webda relies on Services (or Beans), they can expose some Routes and the Application can deployed using different types of Deployment"}),"\n",(0,s.jsxs)(n.p,{children:["The configuration system relies on JSON files: ",(0,s.jsx)(n.code,{children:"webda.config.json"}),", it can be seen as the ",(0,s.jsx)(n.code,{children:"applicationContext.xml"})," of Spring framework."]}),"\n",(0,s.jsx)(n.p,{children:"The framework also simplifies the deployment with builtin support for AWS Lambda, Containers, local debug."}),"\n",(0,s.jsx)(n.h2,{id:"under-the-hood",children:"Under the hood"}),"\n",(0,s.jsxs)(n.p,{children:["Webda on compilation will produce a ",(0,s.jsx)(n.code,{children:"webda.module.json"})," file, it analyzes your code to get the relationship between your models, the hierarchy of models, the structure of the models (JSON Schemas)"]}),"\n",(0,s.jsx)(n.p,{children:"The framework at runtime read this reflective data to expose smartly its logic."}),"\n",(0,s.jsx)(n.h2,{id:"services",children:"Services"}),"\n",(0,s.jsx)(n.h3,{id:"parameters",children:"Parameters"}),"\n",(0,s.jsx)(n.p,{children:"The service will be injected with parameters based on this expression"}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-js",children:"{...app.parameters, ...deployment.parameters, ...service.parameters, ...deployment.service.parameters}\n"})}),"\n",(0,s.jsxs)(n.p,{children:["It allows you to share parameters with all services by defining them in the ",(0,s.jsx)(n.code,{children:"parameters"})," section of ",(0,s.jsx)(n.code,{children:"webda.config.json"}),"\nA deployment can then decide to override this parameters allowing you to override for example the ",(0,s.jsx)(n.code,{children:"website"})," parameter to your specific deployment value."]}),"\n",(0,s.jsx)(n.h2,{id:"routes",children:"Routes"}),"\n",(0,s.jsxs)(n.p,{children:["After all webda is there to create API, a Service can manage a route by using the ",(0,s.jsx)(n.code,{children:"@Route"})," annotation or use the ",(0,s.jsx)(n.code,{children:"._addRoute"})," method."]}),"\n",(0,s.jsxs)(n.p,{children:["If the Service is not designed to be extend of reused the ",(0,s.jsx)(n.code,{children:"@Route"})," annotation is the simplest way"]}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-js",metastring:'title="src/myservice.ts"',children:'\n    @Route("/myroute", ["GET"])\n    myHandler(ctx: Context) {\n        // Do something\n    }\n'})}),"\n",(0,s.jsx)(n.p,{children:"If you plan to reuse your component, it might be a good idea to make its routes configurable to avoid any conflicts."}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-js",metastring:'title="src/myservice.ts"',children:"class MyServiceParameter extends ServiceParameter {\n    constructor(params) {\n        super(params);\n        // Define your default params here\n    }\n}\n\nclass MyService<T extends MyServiceParameter> extends Service<T> {\n    resolve() {\n        super.resolve();\n        this._addRoute(...)\n    }\n\n    loadParameters(params: any) {\n        return new MyServiceParameter(params);\n    }\n}\n"})}),"\n",(0,s.jsx)(n.h3,{id:"retrieve-parameters",children:"Retrieve parameters"}),"\n",(0,s.jsxs)(n.p,{children:["Within a service, you retrieve its parameter by calling the ",(0,s.jsx)(n.code,{children:"this.parameter"})," property."]}),"\n",(0,s.jsx)(n.h2,{id:"deployment",children:"Deployment"}),"\n",(0,s.jsx)(n.p,{children:"So you have a Application that works and is ready to deploy, the Deployment is a unit of Deployers that will lift your Application and deploy it to Kubernetes, Docker, Lambda."}),"\n",(0,s.jsxs)(n.p,{children:["A ",(0,s.jsx)(n.code,{children:"Deployer"})," will create the Docker image and push it, or create the ",(0,s.jsx)(n.code,{children:".zip"})," to send to Lambda"]}),"\n",(0,s.jsx)(n.h2,{id:"application",children:"Application"}),"\n",(0,s.jsxs)(n.p,{children:["This is your whole application including the ",(0,s.jsx)(n.code,{children:"package.json"})," and the ",(0,s.jsx)(n.code,{children:"webda.config.json"}),", so it is a group of ",(0,s.jsx)(n.code,{children:"Services"})," and ",(0,s.jsx)(n.code,{children:"Modules"})," defining your global application."]}),"\n",(0,s.jsx)(n.h2,{id:"modules",children:"Modules"}),"\n",(0,s.jsxs)(n.p,{children:["You can create a module to share some behavior between different application by defining a ",(0,s.jsx)(n.code,{children:"webda.module.json"})]}),"\n",(0,s.jsxs)(n.p,{children:["Webda on startup scan the node_modules for ",(0,s.jsx)(n.code,{children:"webda.module.json"}),", it build its map of available ServicesType according to theses modules."]}),"\n",(0,s.jsx)(n.h3,{id:"shell-module",children:"Shell module"}),"\n",(0,s.jsxs)(n.p,{children:["You add your custom command to the ",(0,s.jsx)(n.code,{children:"webda"})," shell command by adding a ",(0,s.jsx)(n.code,{children:"webda.shell.json"})]})]})}function h(e={}){const{wrapper:n}={...(0,r.M)(),...e.components};return n?(0,s.jsx)(n,{...e,children:(0,s.jsx)(c,{...e})}):c(e)}},4552:(e,n,i)=>{i.d(n,{I:()=>a,M:()=>o});var s=i(11504);const r={},t=s.createContext(r);function o(e){const n=s.useContext(t);return s.useMemo((function(){return"function"==typeof e?e(n):{...n,...e}}),[n,e])}function a(e){let n;return n=e.disableParentContext?"function"==typeof e.components?e.components(r):e.components||r:o(e.components),s.createElement(t.Provider,{value:n},e.children)}}}]);