"use strict";(self.webpackChunk_webda_docs=self.webpackChunk_webda_docs||[]).push([[34731],{95824:(e,s,r)=>{r.r(s),r.d(s,{assets:()=>i,contentTitle:()=>d,default:()=>a,frontMatter:()=>c,metadata:()=>o,toc:()=>h});var l=r(17624),n=r(4552);const c={},d="Class: abstract Deployer<T>",o={id:"shell/classes/Deployer",title:"Deployer",description:"@webda/shell \u2022 Readme \\| API",source:"@site/typedoc/shell/classes/Deployer.md",sourceDirName:"shell/classes",slug:"/shell/classes/Deployer",permalink:"/typedoc/shell/classes/Deployer",draft:!1,unlisted:!1,tags:[],version:"current",frontMatter:{},sidebar:"sidebar",previous:{title:"Container",permalink:"/typedoc/shell/classes/Container"},next:{title:"Deployment",permalink:"/typedoc/shell/classes/Deployment"}},i={},h=[{value:"Extends",id:"extends",level:2},{value:"Type parameters",id:"type-parameters",level:2},{value:"Constructors",id:"constructors",level:2},{value:"new Deployer(manager, resources)",id:"new-deployermanager-resources",level:3},{value:"Parameters",id:"parameters",level:4},{value:"Returns",id:"returns",level:4},{value:"Overrides",id:"overrides",level:4},{value:"Source",id:"source",level:4},{value:"Properties",id:"properties",level:2},{value:"_defaulted",id:"_defaulted",level:3},{value:"Source",id:"source-1",level:4},{value:"app",id:"app",level:3},{value:"Source",id:"source-2",level:4},{value:"logger",id:"logger",level:3},{value:"Source",id:"source-3",level:4},{value:"manager",id:"manager",level:3},{value:"See",id:"see",level:4},{value:"Source",id:"source-4",level:4},{value:"name",id:"name",level:3},{value:"Source",id:"source-5",level:4},{value:"now",id:"now",level:3},{value:"Source",id:"source-6",level:4},{value:"packageDescription",id:"packagedescription",level:3},{value:"Source",id:"source-7",level:4},{value:"parameters",id:"parameters-1",level:3},{value:"Source",id:"source-8",level:4},{value:"resources",id:"resources",level:3},{value:"Inherited from",id:"inherited-from",level:4},{value:"Source",id:"source-9",level:4},{value:"type",id:"type",level:3},{value:"Source",id:"source-10",level:4},{value:"Methods",id:"methods",level:2},{value:"defaultResources()",id:"defaultresources",level:3},{value:"Returns",id:"returns-1",level:4},{value:"Source",id:"source-11",level:4},{value:"deploy()",id:"deploy",level:3},{value:"Returns",id:"returns-2",level:4},{value:"Source",id:"source-12",level:4},{value:"execute()",id:"execute",level:3},{value:"Parameters",id:"parameters-2",level:4},{value:"Returns",id:"returns-3",level:4},{value:"error",id:"error",level:5},{value:"output",id:"output",level:5},{value:"status",id:"status",level:5},{value:"Source",id:"source-13",level:4},{value:"getApplication()",id:"getapplication",level:3},{value:"Returns",id:"returns-4",level:4},{value:"Source",id:"source-14",level:4},{value:"loadDefaults()",id:"loaddefaults",level:3},{value:"Returns",id:"returns-5",level:4},{value:"Source",id:"source-15",level:4},{value:"replaceResourcesVariables()",id:"replaceresourcesvariables",level:3},{value:"Returns",id:"returns-6",level:4},{value:"Source",id:"source-16",level:4},{value:"replaceVariables()",id:"replacevariables",level:3},{value:"Parameters",id:"parameters-3",level:4},{value:"Returns",id:"returns-7",level:4},{value:"Source",id:"source-17",level:4},{value:"setName()",id:"setname",level:3},{value:"Parameters",id:"parameters-4",level:4},{value:"Returns",id:"returns-8",level:4},{value:"Source",id:"source-18",level:4},{value:"setType()",id:"settype",level:3},{value:"Parameters",id:"parameters-5",level:4},{value:"Returns",id:"returns-9",level:4},{value:"Source",id:"source-19",level:4},{value:"getSchema()",id:"getschema",level:3},{value:"Returns",id:"returns-10",level:4},{value:"Inherited from",id:"inherited-from-1",level:4},{value:"Source",id:"source-20",level:4}];function t(e){const s={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",h4:"h4",h5:"h5",hr:"hr",li:"li",p:"p",pre:"pre",strong:"strong",ul:"ul",...(0,n.M)(),...e.components};return(0,l.jsxs)(l.Fragment,{children:[(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"@webda/shell"})," \u2022 ",(0,l.jsx)(s.a,{href:"/typedoc/shell/",children:"Readme"})," | ",(0,l.jsx)(s.a,{href:"/typedoc/shell/globals",children:"API"})]}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsxs)(s.h1,{id:"class-abstract-deployert",children:["Class: ",(0,l.jsx)(s.code,{children:"abstract"})," Deployer<T>"]}),"\n",(0,l.jsx)(s.h2,{id:"extends",children:"Extends"}),"\n",(0,l.jsxs)(s.ul,{children:["\n",(0,l.jsxs)(s.li,{children:[(0,l.jsx)(s.code,{children:"AbstractDeployer"}),"<",(0,l.jsx)(s.code,{children:"T"}),">"]}),"\n"]}),"\n",(0,l.jsx)(s.h2,{id:"type-parameters",children:"Type parameters"}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"T"})," extends ",(0,l.jsx)(s.code,{children:"DeployerResources"})]}),"\n",(0,l.jsx)(s.h2,{id:"constructors",children:"Constructors"}),"\n",(0,l.jsx)(s.h3,{id:"new-deployermanager-resources",children:"new Deployer(manager, resources)"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"new Deployer"}),"<",(0,l.jsx)(s.code,{children:"T"}),">(",(0,l.jsx)(s.code,{children:"manager"}),", ",(0,l.jsx)(s.code,{children:"resources"}),"): ",(0,l.jsx)(s.a,{href:"/typedoc/shell/classes/Deployer",children:(0,l.jsx)(s.code,{children:"Deployer"})}),"<",(0,l.jsx)(s.code,{children:"T"}),">"]}),"\n"]}),"\n",(0,l.jsx)(s.h4,{id:"parameters",children:"Parameters"}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"manager"}),": ",(0,l.jsx)(s.a,{href:"/typedoc/shell/classes/DeploymentManager",children:(0,l.jsx)(s.code,{children:"DeploymentManager"})})]}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"resources"}),": ",(0,l.jsx)(s.code,{children:"T"}),"= ",(0,l.jsx)(s.code,{children:"undefined"})]}),"\n",(0,l.jsx)(s.h4,{id:"returns",children:"Returns"}),"\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.a,{href:"/typedoc/shell/classes/Deployer",children:(0,l.jsx)(s.code,{children:"Deployer"})}),"<",(0,l.jsx)(s.code,{children:"T"}),">"]}),"\n",(0,l.jsx)(s.h4,{id:"overrides",children:"Overrides"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.code,{children:"AbstractDeployer<T>.constructor"})}),"\n",(0,l.jsx)(s.h4,{id:"source",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L41",children:"packages/shell/src/deployers/deployer.ts:41"})}),"\n",(0,l.jsx)(s.h2,{id:"properties",children:"Properties"}),"\n",(0,l.jsx)(s.h3,{id:"_defaulted",children:"_defaulted"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"_defaulted"}),": ",(0,l.jsx)(s.code,{children:"boolean"})," = ",(0,l.jsx)(s.code,{children:"false"})]}),"\n"]}),"\n",(0,l.jsx)(s.h4,{id:"source-1",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L27",children:"packages/shell/src/deployers/deployer.ts:27"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"app",children:"app"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"app"}),": ",(0,l.jsx)(s.code,{children:"SourceApplication"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Current application being deployed"}),"\n",(0,l.jsx)(s.h4,{id:"source-2",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L22",children:"packages/shell/src/deployers/deployer.ts:22"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"logger",children:"logger"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"logger"}),": ",(0,l.jsx)(s.code,{children:"Logger"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Logger to use"}),"\n",(0,l.jsx)(s.h4,{id:"source-3",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L31",children:"packages/shell/src/deployers/deployer.ts:31"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"manager",children:"manager"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"manager"}),": ",(0,l.jsx)(s.a,{href:"/typedoc/shell/classes/DeploymentManager",children:(0,l.jsx)(s.code,{children:"DeploymentManager"})})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Service who manage all deployments"}),"\n",(0,l.jsx)(s.h4,{id:"see",children:"See"}),"\n",(0,l.jsx)(s.p,{children:"DeploymentManager"}),"\n",(0,l.jsx)(s.h4,{id:"source-4",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L18",children:"packages/shell/src/deployers/deployer.ts:18"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"name",children:"name"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"name"}),": ",(0,l.jsx)(s.code,{children:"string"})]}),"\n"]}),"\n",(0,l.jsx)(s.h4,{id:"source-5",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L32",children:"packages/shell/src/deployers/deployer.ts:32"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"now",children:"now"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"now"}),": ",(0,l.jsx)(s.code,{children:"number"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Current date"}),"\n",(0,l.jsx)(s.h4,{id:"source-6",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L37",children:"packages/shell/src/deployers/deployer.ts:37"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"packagedescription",children:"packageDescription"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"packageDescription"}),": ",(0,l.jsx)(s.code,{children:"any"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Package description from package.json"}),"\n",(0,l.jsx)(s.h4,{id:"source-7",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L26",children:"packages/shell/src/deployers/deployer.ts:26"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"parameters-1",children:"parameters"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"parameters"}),": ",(0,l.jsx)(s.code,{children:"any"})]}),"\n"]}),"\n",(0,l.jsx)(s.h4,{id:"source-8",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L39",children:"packages/shell/src/deployers/deployer.ts:39"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"resources",children:"resources"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"resources"}),": ",(0,l.jsx)(s.code,{children:"T"})]}),"\n"]}),"\n",(0,l.jsx)(s.h4,{id:"inherited-from",children:"Inherited from"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.code,{children:"AbstractDeployer.resources"})}),"\n",(0,l.jsx)(s.h4,{id:"source-9",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:"packages/core/lib/utils/abstractdeployer.d.ts:7"}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"type",children:"type"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"type"}),": ",(0,l.jsx)(s.code,{children:"string"})]}),"\n"]}),"\n",(0,l.jsx)(s.h4,{id:"source-10",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L33",children:"packages/shell/src/deployers/deployer.ts:33"})}),"\n",(0,l.jsx)(s.h2,{id:"methods",children:"Methods"}),"\n",(0,l.jsx)(s.h3,{id:"defaultresources",children:"defaultResources()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"defaultResources"}),"(): ",(0,l.jsx)(s.code,{children:"Promise"}),"<",(0,l.jsx)(s.code,{children:"void"}),">"]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Initiate the default value for resources"}),"\n",(0,l.jsx)(s.h4,{id:"returns-1",children:"Returns"}),"\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.code,{children:"Promise"}),"<",(0,l.jsx)(s.code,{children:"void"}),">"]}),"\n",(0,l.jsx)(s.h4,{id:"source-11",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L77",children:"packages/shell/src/deployers/deployer.ts:77"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"deploy",children:"deploy()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:(0,l.jsx)(s.code,{children:"abstract"})})," ",(0,l.jsx)(s.strong,{children:"deploy"}),"(): ",(0,l.jsx)(s.code,{children:"Promise"}),"<",(0,l.jsx)(s.code,{children:"any"}),">"]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Deploy the application"}),"\n",(0,l.jsx)(s.h4,{id:"returns-2",children:"Returns"}),"\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.code,{children:"Promise"}),"<",(0,l.jsx)(s.code,{children:"any"}),">"]}),"\n",(0,l.jsx)(s.h4,{id:"source-12",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L91",children:"packages/shell/src/deployers/deployer.ts:91"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"execute",children:"execute()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"execute"}),"(",(0,l.jsx)(s.code,{children:"command"}),", ",(0,l.jsx)(s.code,{children:"stdin"}),", ",(0,l.jsx)(s.code,{children:"resolveOnError"}),", ",(0,l.jsx)(s.code,{children:"logLevel"}),"): ",(0,l.jsx)(s.code,{children:"Promise"}),"<",(0,l.jsx)(s.code,{children:"Object"}),">"]}),"\n"]}),"\n",(0,l.jsx)(s.h4,{id:"parameters-2",children:"Parameters"}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"command"}),": ",(0,l.jsx)(s.code,{children:"string"})]}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"stdin"}),": ",(0,l.jsx)(s.code,{children:"string"}),"= ",(0,l.jsx)(s.code,{children:"undefined"})]}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"resolveOnError"}),": ",(0,l.jsx)(s.code,{children:"boolean"}),"= ",(0,l.jsx)(s.code,{children:"false"})]}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"logLevel"}),": ",(0,l.jsx)(s.code,{children:"WorkerLogLevel"}),"= ",(0,l.jsx)(s.code,{children:'"TRACE"'})]}),"\n",(0,l.jsx)(s.h4,{id:"returns-3",children:"Returns"}),"\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.code,{children:"Promise"}),"<",(0,l.jsx)(s.code,{children:"Object"}),">"]}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsx)(s.h5,{id:"error",children:"error"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"error"}),": ",(0,l.jsx)(s.code,{children:"string"})]}),"\n"]}),"\n",(0,l.jsx)(s.h5,{id:"output",children:"output"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"output"}),": ",(0,l.jsx)(s.code,{children:"string"})]}),"\n"]}),"\n",(0,l.jsx)(s.h5,{id:"status",children:"status"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"status"}),": ",(0,l.jsx)(s.code,{children:"number"})]}),"\n"]}),"\n"]}),"\n",(0,l.jsx)(s.h4,{id:"source-13",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L127",children:"packages/shell/src/deployers/deployer.ts:127"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"getapplication",children:"getApplication()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"getApplication"}),"(): ",(0,l.jsx)(s.code,{children:"Application"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Return the Webda Application"}),"\n",(0,l.jsx)(s.h4,{id:"returns-4",children:"Returns"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.code,{children:"Application"})}),"\n",(0,l.jsx)(s.h4,{id:"source-14",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L70",children:"packages/shell/src/deployers/deployer.ts:70"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"loaddefaults",children:"loadDefaults()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"loadDefaults"}),"(): ",(0,l.jsx)(s.code,{children:"Promise"}),"<",(0,l.jsx)(s.code,{children:"void"}),">"]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Load default resources"}),"\n",(0,l.jsx)(s.h4,{id:"returns-5",children:"Returns"}),"\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.code,{children:"Promise"}),"<",(0,l.jsx)(s.code,{children:"void"}),">"]}),"\n",(0,l.jsx)(s.h4,{id:"source-15",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L84",children:"packages/shell/src/deployers/deployer.ts:84"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"replaceresourcesvariables",children:"replaceResourcesVariables()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"replaceResourcesVariables"}),"(): ",(0,l.jsx)(s.code,{children:"void"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Replace the resources variables"}),"\n",(0,l.jsx)(s.pre,{children:(0,l.jsx)(s.code,{children:"this.resources = this.replaceVariables(this.resources);\n"})}),"\n",(0,l.jsx)(s.h4,{id:"returns-6",children:"Returns"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.code,{children:"void"})}),"\n",(0,l.jsx)(s.h4,{id:"source-16",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L118",children:"packages/shell/src/deployers/deployer.ts:118"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"replacevariables",children:"replaceVariables()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"replaceVariables"}),"(",(0,l.jsx)(s.code,{children:"obj"}),"): ",(0,l.jsx)(s.code,{children:"any"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Replace variables in resources"}),"\n",(0,l.jsx)(s.h4,{id:"parameters-3",children:"Parameters"}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"obj"}),": ",(0,l.jsx)(s.code,{children:"any"})]}),"\n",(0,l.jsx)(s.p,{children:"to replace variables from"}),"\n",(0,l.jsx)(s.h4,{id:"returns-7",children:"Returns"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.code,{children:"any"})}),"\n",(0,l.jsx)(s.h4,{id:"source-17",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L98",children:"packages/shell/src/deployers/deployer.ts:98"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"setname",children:"setName()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"setName"}),"(",(0,l.jsx)(s.code,{children:"name"}),"): ",(0,l.jsx)(s.code,{children:"void"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Set the deployer name"}),"\n",(0,l.jsx)(s.h4,{id:"parameters-4",children:"Parameters"}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"name"}),": ",(0,l.jsx)(s.code,{children:"string"})]}),"\n",(0,l.jsx)(s.h4,{id:"returns-8",children:"Returns"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.code,{children:"void"})}),"\n",(0,l.jsx)(s.h4,{id:"source-18",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L55",children:"packages/shell/src/deployers/deployer.ts:55"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"settype",children:"setType()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"setType"}),"(",(0,l.jsx)(s.code,{children:"type"}),"): ",(0,l.jsx)(s.code,{children:"void"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Set the deployer name"}),"\n",(0,l.jsx)(s.h4,{id:"parameters-5",children:"Parameters"}),"\n",(0,l.jsxs)(s.p,{children:["\u2022 ",(0,l.jsx)(s.strong,{children:"type"}),": ",(0,l.jsx)(s.code,{children:"string"})]}),"\n",(0,l.jsx)(s.h4,{id:"returns-9",children:"Returns"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.code,{children:"void"})}),"\n",(0,l.jsx)(s.h4,{id:"source-19",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/shell/src/deployers/deployer.ts#L63",children:"packages/shell/src/deployers/deployer.ts:63"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"getschema",children:"getSchema()"}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:(0,l.jsx)(s.code,{children:"static"})})," ",(0,l.jsx)(s.strong,{children:"getSchema"}),"(): ",(0,l.jsx)(s.code,{children:"JSONSchema6"})]}),"\n"]}),"\n",(0,l.jsx)(s.p,{children:"Allow to specify the JSONSchema to configure this service"}),"\n",(0,l.jsx)(s.p,{children:"Return undefined by default to fallback on the guess from ServiceParamaters"}),"\n",(0,l.jsx)(s.p,{children:"Using this method should only be exception"}),"\n",(0,l.jsx)(s.h4,{id:"returns-10",children:"Returns"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.code,{children:"JSONSchema6"})}),"\n",(0,l.jsx)(s.h4,{id:"inherited-from-1",children:"Inherited from"}),"\n",(0,l.jsx)(s.p,{children:(0,l.jsx)(s.code,{children:"AbstractDeployer.getSchema"})}),"\n",(0,l.jsx)(s.h4,{id:"source-20",children:"Source"}),"\n",(0,l.jsx)(s.p,{children:"packages/core/lib/utils/abstractdeployer.d.ts:15"})]})}function a(e={}){const{wrapper:s}={...(0,n.M)(),...e.components};return s?(0,l.jsx)(s,{...e,children:(0,l.jsx)(t,{...e})}):t(e)}},4552:(e,s,r)=>{r.d(s,{I:()=>o,M:()=>d});var l=r(11504);const n={},c=l.createContext(n);function d(e){const s=l.useContext(c);return l.useMemo((function(){return"function"==typeof e?e(s):{...s,...e}}),[s,e])}function o(e){let s;return s=e.disableParentContext?"function"==typeof e.components?e.components(n):e.components||n:d(e.components),l.createElement(c.Provider,{value:s},e.children)}}}]);