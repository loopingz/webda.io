"use strict";(self.webpackChunk_webda_docs=self.webpackChunk_webda_docs||[]).push([[63788],{3728:(e,n,r)=>{r.r(n),r.d(n,{assets:()=>d,contentTitle:()=>i,default:()=>h,frontMatter:()=>c,metadata:()=>o,toc:()=>a});var t=r(17624),s=r(4552);const c={},i="Function: Inject()",o={id:"core/functions/Inject",title:"Inject",description:"@webda/core \u2022 Readme \\| API",source:"@site/typedoc/core/functions/Inject.md",sourceDirName:"core/functions",slug:"/core/functions/Inject",permalink:"/typedoc/core/functions/Inject",draft:!1,unlisted:!1,tags:[],version:"current",frontMatter:{},sidebar:"sidebar",previous:{title:"Expose",permalink:"/typedoc/core/functions/Expose"},next:{title:"NotEnumerable",permalink:"/typedoc/core/functions/NotEnumerable"}},d={},a=[{value:"Parameters",id:"parameters",level:2},{value:"Returns",id:"returns",level:2},{value:"Parameters",id:"parameters-1",level:3},{value:"Returns",id:"returns-1",level:3},{value:"Source",id:"source",level:2}];function l(e){const n={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",hr:"hr",p:"p",strong:"strong",...(0,s.M)(),...e.components};return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(n.p,{children:[(0,t.jsx)(n.strong,{children:"@webda/core"})," \u2022 ",(0,t.jsx)(n.a,{href:"/typedoc/core/",children:"Readme"})," | ",(0,t.jsx)(n.a,{href:"/typedoc/core/globals",children:"API"})]}),"\n",(0,t.jsx)(n.hr,{}),"\n",(0,t.jsx)(n.h1,{id:"function-inject",children:"Function: Inject()"}),"\n",(0,t.jsxs)(n.blockquote,{children:["\n",(0,t.jsxs)(n.p,{children:[(0,t.jsx)(n.strong,{children:"Inject"}),"(",(0,t.jsx)(n.code,{children:"parameterOrName"}),"?, ",(0,t.jsx)(n.code,{children:"defaultValue"}),"?, ",(0,t.jsx)(n.code,{children:"optional"}),"?): (",(0,t.jsx)(n.code,{children:"target"}),", ",(0,t.jsx)(n.code,{children:"propertyName"}),") => ",(0,t.jsx)(n.code,{children:"void"})]}),"\n"]}),"\n",(0,t.jsx)(n.p,{children:"Inject a Bean inside this attribute"}),"\n",(0,t.jsxs)(n.p,{children:["If defaultValue is undefined and parameter is not starting with ",(0,t.jsx)(n.code,{children:"params:"}),", it will\nresolve by calling ",(0,t.jsx)(n.code,{children:"this.getService(parameterOrName)"})]}),"\n",(0,t.jsxs)(n.p,{children:["If defaultValue is defined or parameterOrName starts with ",(0,t.jsx)(n.code,{children:"params:"})," then first argument is\nconsider a parameter and it will resolve by calling ",(0,t.jsx)(n.code,{children:"this.getService(this.getParameters()[parameterOrName] || defaultValue)"})]}),"\n",(0,t.jsx)(n.h2,{id:"parameters",children:"Parameters"}),"\n",(0,t.jsxs)(n.p,{children:["\u2022 ",(0,t.jsx)(n.strong,{children:"parameterOrName?"}),": ",(0,t.jsx)(n.code,{children:"string"})]}),"\n",(0,t.jsx)(n.p,{children:"of the service to inject"}),"\n",(0,t.jsx)(n.p,{children:"Might consider to split into two annotations"}),"\n",(0,t.jsxs)(n.p,{children:["\u2022 ",(0,t.jsx)(n.strong,{children:"defaultValue?"}),": ",(0,t.jsx)(n.code,{children:"string"})," | ",(0,t.jsx)(n.code,{children:"boolean"})]}),"\n",(0,t.jsxs)(n.p,{children:["\u2022 ",(0,t.jsx)(n.strong,{children:"optional?"}),": ",(0,t.jsx)(n.code,{children:"boolean"})]}),"\n",(0,t.jsx)(n.h2,{id:"returns",children:"Returns"}),"\n",(0,t.jsx)(n.p,{children:(0,t.jsx)(n.code,{children:"Function"})}),"\n",(0,t.jsxs)(n.blockquote,{children:["\n",(0,t.jsx)(n.h3,{id:"parameters-1",children:"Parameters"}),"\n",(0,t.jsxs)(n.p,{children:["\u2022 ",(0,t.jsx)(n.strong,{children:"target"}),": ",(0,t.jsx)(n.code,{children:"any"})]}),"\n",(0,t.jsxs)(n.p,{children:["\u2022 ",(0,t.jsx)(n.strong,{children:"propertyName"}),": ",(0,t.jsx)(n.code,{children:"string"})]}),"\n",(0,t.jsx)(n.h3,{id:"returns-1",children:"Returns"}),"\n",(0,t.jsx)(n.p,{children:(0,t.jsx)(n.code,{children:"void"})}),"\n"]}),"\n",(0,t.jsx)(n.h2,{id:"source",children:"Source"}),"\n",(0,t.jsx)(n.p,{children:(0,t.jsx)(n.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/core/src/services/service.ts#L96",children:"packages/core/src/services/service.ts:96"})})]})}function h(e={}){const{wrapper:n}={...(0,s.M)(),...e.components};return n?(0,t.jsx)(n,{...e,children:(0,t.jsx)(l,{...e})}):l(e)}},4552:(e,n,r)=>{r.d(n,{I:()=>o,M:()=>i});var t=r(11504);const s={},c=t.createContext(s);function i(e){const n=t.useContext(c);return t.useMemo((function(){return"function"==typeof e?e(n):{...n,...e}}),[n,e])}function o(e){let n;return n=e.disableParentContext?"function"==typeof e.components?e.components(s):e.components||s:i(e.components),t.createElement(c.Provider,{value:n},e.children)}}}]);