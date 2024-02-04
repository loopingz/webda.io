"use strict";(self.webpackChunk_webda_docs=self.webpackChunk_webda_docs||[]).push([[4892],{30428:(e,n,s)=>{s.r(n),s.d(n,{assets:()=>r,contentTitle:()=>a,default:()=>p,frontMatter:()=>o,metadata:()=>c,toc:()=>d});var t=s(17624),i=s(4552);const o={},a="webda.config.json",c={id:"Concepts/Webda.config.json",title:"webda.config.json",description:"This is the application definition file",source:"@site/pages/Concepts/Webda.config.json.md",sourceDirName:"Concepts",slug:"/Concepts/Webda.config.json",permalink:"/docs/Concepts/Webda.config.json",draft:!1,unlisted:!1,editUrl:"https://github.com/loopingz/webda.io/tree/docs/pages/Concepts/Webda.config.json.md",tags:[],version:"current",frontMatter:{},sidebar:"sidebar",previous:{title:"Session",permalink:"/docs/Concepts/Session"},next:{title:"REST",permalink:"/docs/REST/"}},r={},d=[{value:"Parameters",id:"parameters",level:2},{value:"Services",id:"services",level:2}];function l(e){const n={code:"code",h1:"h1",h2:"h2",p:"p",pre:"pre",...(0,i.M)(),...e.components};return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(n.h1,{id:"webdaconfigjson",children:"webda.config.json"}),"\n",(0,t.jsx)(n.p,{children:"This is the application definition file"}),"\n",(0,t.jsx)(n.p,{children:"It has 2 main sections:"}),"\n",(0,t.jsx)(n.pre,{children:(0,t.jsx)(n.code,{className:"language-json",metastring:'title="webda.config.json"',children:'{\n  "parameters": {\n    // This will be passed to all your Services and can contain common parameters\n  },\n  "services": {\n    // Define each Service and its own parameters\n  },\n  "version": "2"\n}\n'})}),"\n",(0,t.jsx)(n.h2,{id:"parameters",children:"Parameters"}),"\n",(0,t.jsx)(n.p,{children:"Each service will be injected with its parameters."}),"\n",(0,t.jsx)(n.h2,{id:"services",children:"Services"}),"\n",(0,t.jsxs)(n.p,{children:["This is a map with all Services name. If the ",(0,t.jsx)(n.code,{children:"type"})," is not defined, then it will default\nto ",(0,t.jsx)(n.code,{children:"type = name"}),", and add default namespace if it does not have a namespace."]})]})}function p(e={}){const{wrapper:n}={...(0,i.M)(),...e.components};return n?(0,t.jsx)(n,{...e,children:(0,t.jsx)(l,{...e})}):l(e)}},4552:(e,n,s)=>{s.d(n,{I:()=>c,M:()=>a});var t=s(11504);const i={},o=t.createContext(i);function a(e){const n=t.useContext(o);return t.useMemo((function(){return"function"==typeof e?e(n):{...n,...e}}),[n,e])}function c(e){let n;return n=e.disableParentContext?"function"==typeof e.components?e.components(i):e.components||i:a(e.components),t.createElement(o.Provider,{value:n},e.children)}}}]);