"use strict";(self.webpackChunk_webda_docs=self.webpackChunk_webda_docs||[]).push([[32208],{85004:(e,r,s)=>{s.r(r),s.d(r,{assets:()=>a,contentTitle:()=>d,default:()=>h,frontMatter:()=>c,metadata:()=>l,toc:()=>t});var i=s(17624),n=s(4552);const c={},d="Class: RegExpStringValidator",l={id:"core/classes/RegExpStringValidator",title:"RegExpStringValidator",description:"@webda/core \u2022 Readme \\| API",source:"@site/typedoc/core/classes/RegExpStringValidator.md",sourceDirName:"core/classes",slug:"/core/classes/RegExpStringValidator",permalink:"/typedoc/core/classes/RegExpStringValidator",draft:!1,unlisted:!1,tags:[],version:"current",frontMatter:{},sidebar:"sidebar",previous:{title:"RESTDomainServiceParameters",permalink:"/typedoc/core/classes/RESTDomainServiceParameters"},next:{title:"RegExpValidator",permalink:"/typedoc/core/classes/RegExpValidator"}},a={},t=[{value:"Example",id:"example",level:2},{value:"Extends",id:"extends",level:2},{value:"Constructors",id:"constructors",level:2},{value:"new RegExpStringValidator(info)",id:"new-regexpstringvalidatorinfo",level:3},{value:"Parameters",id:"parameters",level:4},{value:"Returns",id:"returns",level:4},{value:"Overrides",id:"overrides",level:4},{value:"Source",id:"source",level:4},{value:"Properties",id:"properties",level:2},{value:"stringValidators",id:"stringvalidators",level:3},{value:"Source",id:"source-1",level:4},{value:"validators",id:"validators",level:3},{value:"Inherited from",id:"inherited-from",level:4},{value:"Source",id:"source-2",level:4},{value:"Methods",id:"methods",level:2},{value:"validate()",id:"validate",level:3},{value:"Parameters",id:"parameters-1",level:4},{value:"Returns",id:"returns-1",level:4},{value:"Overrides",id:"overrides-1",level:4},{value:"Source",id:"source-3",level:4},{value:"getRegExp()",id:"getregexp",level:3},{value:"Parameters",id:"parameters-2",level:4},{value:"Returns",id:"returns-2",level:4},{value:"Inherited from",id:"inherited-from-1",level:4},{value:"Source",id:"source-4",level:4}];function o(e){const r={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",h4:"h4",hr:"hr",li:"li",p:"p",pre:"pre",strong:"strong",ul:"ul",...(0,n.M)(),...e.components};return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.strong,{children:"@webda/core"})," \u2022 ",(0,i.jsx)(r.a,{href:"/typedoc/core/",children:"Readme"})," | ",(0,i.jsx)(r.a,{href:"/typedoc/core/globals",children:"API"})]}),"\n",(0,i.jsx)(r.hr,{}),"\n",(0,i.jsx)(r.h1,{id:"class-regexpstringvalidator",children:"Class: RegExpStringValidator"}),"\n",(0,i.jsx)(r.p,{children:"Standardized way to allow string/regex validation within configuration"}),"\n",(0,i.jsxs)(r.p,{children:["If url is prefixed with ",(0,i.jsx)(r.code,{children:"regex:"})," it is considered a regex"]}),"\n",(0,i.jsx)(r.h2,{id:"example",children:"Example"}),"\n",(0,i.jsx)(r.pre,{children:(0,i.jsx)(r.code,{className:"language-typescript",children:"class MyServiceParameters extends ServiceParameters {\n   urls: string[];\n}\n\nclass MyService extends Service {\n   loadParameters(params:any) {\n     const parameters = new MyServiceParameters(params);\n     this.urlsValidator = new RegExpStringValidator(parameters.urls);\n     return parameters;\n   }\n}\n"})}),"\n",(0,i.jsx)(r.h2,{id:"extends",children:"Extends"}),"\n",(0,i.jsxs)(r.ul,{children:["\n",(0,i.jsx)(r.li,{children:(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpValidator",children:(0,i.jsx)(r.code,{children:"RegExpValidator"})})}),"\n"]}),"\n",(0,i.jsx)(r.h2,{id:"constructors",children:"Constructors"}),"\n",(0,i.jsx)(r.h3,{id:"new-regexpstringvalidatorinfo",children:"new RegExpStringValidator(info)"}),"\n",(0,i.jsxs)(r.blockquote,{children:["\n",(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.strong,{children:"new RegExpStringValidator"}),"(",(0,i.jsx)(r.code,{children:"info"}),"): ",(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpStringValidator",children:(0,i.jsx)(r.code,{children:"RegExpStringValidator"})})]}),"\n"]}),"\n",(0,i.jsx)(r.h4,{id:"parameters",children:"Parameters"}),"\n",(0,i.jsxs)(r.p,{children:["\u2022 ",(0,i.jsx)(r.strong,{children:"info"}),": ",(0,i.jsx)(r.code,{children:"string"})," | ",(0,i.jsx)(r.code,{children:"string"}),"[]"]}),"\n",(0,i.jsx)(r.h4,{id:"returns",children:"Returns"}),"\n",(0,i.jsx)(r.p,{children:(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpStringValidator",children:(0,i.jsx)(r.code,{children:"RegExpStringValidator"})})}),"\n",(0,i.jsx)(r.h4,{id:"overrides",children:"Overrides"}),"\n",(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpValidator",children:(0,i.jsx)(r.code,{children:"RegExpValidator"})}),".",(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpValidator#constructors",children:(0,i.jsx)(r.code,{children:"constructor"})})]}),"\n",(0,i.jsx)(r.h4,{id:"source",children:"Source"}),"\n",(0,i.jsx)(r.p,{children:(0,i.jsx)(r.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/core/src/services/service.ts#L228",children:"packages/core/src/services/service.ts:228"})}),"\n",(0,i.jsx)(r.h2,{id:"properties",children:"Properties"}),"\n",(0,i.jsx)(r.h3,{id:"stringvalidators",children:"stringValidators"}),"\n",(0,i.jsxs)(r.blockquote,{children:["\n",(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.strong,{children:"stringValidators"}),": ",(0,i.jsx)(r.code,{children:"string"}),"[]"]}),"\n"]}),"\n",(0,i.jsx)(r.h4,{id:"source-1",children:"Source"}),"\n",(0,i.jsx)(r.p,{children:(0,i.jsx)(r.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/core/src/services/service.ts#L227",children:"packages/core/src/services/service.ts:227"})}),"\n",(0,i.jsx)(r.hr,{}),"\n",(0,i.jsx)(r.h3,{id:"validators",children:"validators"}),"\n",(0,i.jsxs)(r.blockquote,{children:["\n",(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.strong,{children:(0,i.jsx)(r.code,{children:"protected"})})," ",(0,i.jsx)(r.strong,{children:"validators"}),": ",(0,i.jsx)(r.code,{children:"RegExp"}),"[]"]}),"\n"]}),"\n",(0,i.jsx)(r.h4,{id:"inherited-from",children:"Inherited from"}),"\n",(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpValidator",children:(0,i.jsx)(r.code,{children:"RegExpValidator"})}),".",(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpValidator#validators",children:(0,i.jsx)(r.code,{children:"validators"})})]}),"\n",(0,i.jsx)(r.h4,{id:"source-2",children:"Source"}),"\n",(0,i.jsx)(r.p,{children:(0,i.jsx)(r.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/core/src/services/service.ts#L186",children:"packages/core/src/services/service.ts:186"})}),"\n",(0,i.jsx)(r.h2,{id:"methods",children:"Methods"}),"\n",(0,i.jsx)(r.h3,{id:"validate",children:"validate()"}),"\n",(0,i.jsxs)(r.blockquote,{children:["\n",(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.strong,{children:"validate"}),"(",(0,i.jsx)(r.code,{children:"value"}),"): ",(0,i.jsx)(r.code,{children:"boolean"})]}),"\n"]}),"\n",(0,i.jsx)(r.p,{children:"Add string validation"}),"\n",(0,i.jsx)(r.h4,{id:"parameters-1",children:"Parameters"}),"\n",(0,i.jsxs)(r.p,{children:["\u2022 ",(0,i.jsx)(r.strong,{children:"value"}),": ",(0,i.jsx)(r.code,{children:"string"})]}),"\n",(0,i.jsx)(r.h4,{id:"returns-1",children:"Returns"}),"\n",(0,i.jsx)(r.p,{children:(0,i.jsx)(r.code,{children:"boolean"})}),"\n",(0,i.jsx)(r.h4,{id:"overrides-1",children:"Overrides"}),"\n",(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpValidator",children:(0,i.jsx)(r.code,{children:"RegExpValidator"})}),".",(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpValidator#validate",children:(0,i.jsx)(r.code,{children:"validate"})})]}),"\n",(0,i.jsx)(r.h4,{id:"source-3",children:"Source"}),"\n",(0,i.jsx)(r.p,{children:(0,i.jsx)(r.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/core/src/services/service.ts#L239",children:"packages/core/src/services/service.ts:239"})}),"\n",(0,i.jsx)(r.hr,{}),"\n",(0,i.jsx)(r.h3,{id:"getregexp",children:"getRegExp()"}),"\n",(0,i.jsxs)(r.blockquote,{children:["\n",(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.strong,{children:(0,i.jsx)(r.code,{children:"static"})})," ",(0,i.jsx)(r.strong,{children:"getRegExp"}),"(",(0,i.jsx)(r.code,{children:"reg"}),"): ",(0,i.jsx)(r.code,{children:"RegExp"})]}),"\n"]}),"\n",(0,i.jsx)(r.h4,{id:"parameters-2",children:"Parameters"}),"\n",(0,i.jsxs)(r.p,{children:["\u2022 ",(0,i.jsx)(r.strong,{children:"reg"}),": ",(0,i.jsx)(r.code,{children:"string"})]}),"\n",(0,i.jsx)(r.h4,{id:"returns-2",children:"Returns"}),"\n",(0,i.jsx)(r.p,{children:(0,i.jsx)(r.code,{children:"RegExp"})}),"\n",(0,i.jsx)(r.h4,{id:"inherited-from-1",children:"Inherited from"}),"\n",(0,i.jsxs)(r.p,{children:[(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpValidator",children:(0,i.jsx)(r.code,{children:"RegExpValidator"})}),".",(0,i.jsx)(r.a,{href:"/typedoc/core/classes/RegExpValidator#getregexp",children:(0,i.jsx)(r.code,{children:"getRegExp"})})]}),"\n",(0,i.jsx)(r.h4,{id:"source-4",children:"Source"}),"\n",(0,i.jsx)(r.p,{children:(0,i.jsx)(r.a,{href:"https://github.com/loopingz/webda.io/blob/1dcb7360/packages/core/src/services/service.ts#L192",children:"packages/core/src/services/service.ts:192"})})]})}function h(e={}){const{wrapper:r}={...(0,n.M)(),...e.components};return r?(0,i.jsx)(r,{...e,children:(0,i.jsx)(o,{...e})}):o(e)}},4552:(e,r,s)=>{s.d(r,{I:()=>l,M:()=>d});var i=s(11504);const n={},c=i.createContext(n);function d(e){const r=i.useContext(c);return i.useMemo((function(){return"function"==typeof e?e(r):{...r,...e}}),[r,e])}function l(e){let r;return r=e.disableParentContext?"function"==typeof e.components?e.components(n):e.components||n:d(e.components),i.createElement(c.Provider,{value:r},e.children)}}}]);