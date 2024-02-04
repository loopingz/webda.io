"use strict";(self.webpackChunk_webda_docs=self.webpackChunk_webda_docs||[]).push([[79560],{89152:(e,s,n)=>{n.r(s),n.d(s,{assets:()=>t,contentTitle:()=>r,default:()=>h,frontMatter:()=>c,metadata:()=>l,toc:()=>d});var o=n(17624),i=n(4552);const c={},r="Class: CookieOptions",l={id:"core/classes/CookieOptions",title:"CookieOptions",description:"@webda/core \u2022 Readme \\| API",source:"@site/typedoc/core/classes/CookieOptions.md",sourceDirName:"core/classes",slug:"/core/classes/CookieOptions",permalink:"/typedoc/core/classes/CookieOptions",draft:!1,unlisted:!1,tags:[],version:"current",frontMatter:{},sidebar:"sidebar",previous:{title:"ConsoleLoggerServiceParameters",permalink:"/typedoc/core/classes/ConsoleLoggerServiceParameters"},next:{title:"CookieSessionManager",permalink:"/typedoc/core/classes/CookieSessionManager"}},t={},d=[{value:"Implements",id:"implements",level:2},{value:"Constructors",id:"constructors",level:2},{value:"new CookieOptions(options, httpContext)",id:"new-cookieoptionsoptions-httpcontext",level:3},{value:"Parameters",id:"parameters",level:4},{value:"Returns",id:"returns",level:4},{value:"Source",id:"source",level:4},{value:"Properties",id:"properties",level:2},{value:"domain?",id:"domain",level:3},{value:"Source",id:"source-1",level:4},{value:"httpOnly?",id:"httponly",level:3},{value:"Default",id:"default",level:4},{value:"Source",id:"source-2",level:4},{value:"maxAge?",id:"maxage",level:3},{value:"Minimum",id:"minimum",level:4},{value:"Default",id:"default-1",level:4},{value:"Source",id:"source-3",level:4},{value:"name?",id:"name",level:3},{value:"Source",id:"source-4",level:4},{value:"path?",id:"path",level:3},{value:"Default",id:"default-2",level:4},{value:"Source",id:"source-5",level:4},{value:"sameSite?",id:"samesite",level:3},{value:"Default",id:"default-3",level:4},{value:"Source",id:"source-6",level:4},{value:"secure?",id:"secure",level:3},{value:"Source",id:"source-7",level:4}];function a(e){const s={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",h4:"h4",hr:"hr",li:"li",p:"p",pre:"pre",strong:"strong",ul:"ul",...(0,i.M)(),...e.components};return(0,o.jsxs)(o.Fragment,{children:[(0,o.jsxs)(s.p,{children:[(0,o.jsx)(s.strong,{children:"@webda/core"})," \u2022 ",(0,o.jsx)(s.a,{href:"/typedoc/core/",children:"Readme"})," | ",(0,o.jsx)(s.a,{href:"/typedoc/core/globals",children:"API"})]}),"\n",(0,o.jsx)(s.hr,{}),"\n",(0,o.jsx)(s.h1,{id:"class-cookieoptions",children:"Class: CookieOptions"}),"\n",(0,o.jsx)(s.p,{children:"Cookie Options"}),"\n",(0,o.jsx)(s.h2,{id:"implements",children:"Implements"}),"\n",(0,o.jsxs)(s.ul,{children:["\n",(0,o.jsxs)(s.li,{children:[(0,o.jsx)(s.code,{children:"Omit"}),"<",(0,o.jsx)(s.code,{children:"CookieSerializeOptions"}),", ",(0,o.jsx)(s.code,{children:'"domain"'}),">"]}),"\n"]}),"\n",(0,o.jsx)(s.h2,{id:"constructors",children:"Constructors"}),"\n",(0,o.jsx)(s.h3,{id:"new-cookieoptionsoptions-httpcontext",children:"new CookieOptions(options, httpContext)"}),"\n",(0,o.jsxs)(s.blockquote,{children:["\n",(0,o.jsxs)(s.p,{children:[(0,o.jsx)(s.strong,{children:"new CookieOptions"}),"(",(0,o.jsx)(s.code,{children:"options"}),", ",(0,o.jsx)(s.code,{children:"httpContext"}),"?): ",(0,o.jsx)(s.a,{href:"/typedoc/core/classes/CookieOptions",children:(0,o.jsx)(s.code,{children:"CookieOptions"})})]}),"\n"]}),"\n",(0,o.jsx)(s.p,{children:"Load with default value"}),"\n",(0,o.jsx)(s.h4,{id:"parameters",children:"Parameters"}),"\n",(0,o.jsxs)(s.p,{children:["\u2022 ",(0,o.jsx)(s.strong,{children:"options"}),": ",(0,o.jsx)(s.code,{children:"Partial"}),"<",(0,o.jsx)(s.a,{href:"/typedoc/core/classes/CookieOptions",children:(0,o.jsx)(s.code,{children:"CookieOptions"})}),">"]}),"\n",(0,o.jsxs)(s.p,{children:["\u2022 ",(0,o.jsx)(s.strong,{children:"httpContext?"}),": ",(0,o.jsx)(s.a,{href:"/typedoc/core/classes/HttpContext",children:(0,o.jsx)(s.code,{children:"HttpContext"})})]}),"\n",(0,o.jsx)(s.h4,{id:"returns",children:"Returns"}),"\n",(0,o.jsx)(s.p,{children:(0,o.jsx)(s.a,{href:"/typedoc/core/classes/CookieOptions",children:(0,o.jsx)(s.code,{children:"CookieOptions"})})}),"\n",(0,o.jsx)(s.h4,{id:"source",children:"Source"}),"\n",(0,o.jsx)(s.p,{children:(0,o.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/d23a4a12/packages/core/src/utils/cookie.ts#L56",children:"packages/core/src/utils/cookie.ts:56"})}),"\n",(0,o.jsx)(s.h2,{id:"properties",children:"Properties"}),"\n",(0,o.jsx)(s.h3,{id:"domain",children:"domain?"}),"\n",(0,o.jsxs)(s.blockquote,{children:["\n",(0,o.jsxs)(s.p,{children:[(0,o.jsx)(s.strong,{children:"domain"}),"?: ",(0,o.jsx)(s.code,{children:"string"})," | ",(0,o.jsx)(s.code,{children:"true"})]}),"\n"]}),"\n",(0,o.jsx)(s.p,{children:"if true domain will be set to the request hostname\nif undefined no domain will be output (browser will use the current domain and only this one)\nif a string is provided it will be used as the domain"}),"\n",(0,o.jsx)(s.p,{children:"When provided a domain is setting the cookie to be available to all subdomains"}),"\n",(0,o.jsx)(s.h4,{id:"source-1",children:"Source"}),"\n",(0,o.jsx)(s.p,{children:(0,o.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/d23a4a12/packages/core/src/utils/cookie.ts#L27",children:"packages/core/src/utils/cookie.ts:27"})}),"\n",(0,o.jsx)(s.hr,{}),"\n",(0,o.jsx)(s.h3,{id:"httponly",children:"httpOnly?"}),"\n",(0,o.jsxs)(s.blockquote,{children:["\n",(0,o.jsxs)(s.p,{children:[(0,o.jsx)(s.strong,{children:"httpOnly"}),"?: ",(0,o.jsx)(s.code,{children:"boolean"})]}),"\n"]}),"\n",(0,o.jsx)(s.h4,{id:"default",children:"Default"}),"\n",(0,o.jsx)(s.pre,{children:(0,o.jsx)(s.code,{className:"language-ts",children:"true\n"})}),"\n",(0,o.jsx)(s.h4,{id:"source-2",children:"Source"}),"\n",(0,o.jsx)(s.p,{children:(0,o.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/d23a4a12/packages/core/src/utils/cookie.ts#L40",children:"packages/core/src/utils/cookie.ts:40"})}),"\n",(0,o.jsx)(s.hr,{}),"\n",(0,o.jsx)(s.h3,{id:"maxage",children:"maxAge?"}),"\n",(0,o.jsxs)(s.blockquote,{children:["\n",(0,o.jsxs)(s.p,{children:[(0,o.jsx)(s.strong,{children:"maxAge"}),"?: ",(0,o.jsx)(s.code,{children:"number"})]}),"\n"]}),"\n",(0,o.jsx)(s.h4,{id:"minimum",children:"Minimum"}),"\n",(0,o.jsx)(s.p,{children:"1"}),"\n",(0,o.jsx)(s.h4,{id:"default-1",children:"Default"}),"\n",(0,o.jsx)(s.pre,{children:(0,o.jsx)(s.code,{className:"language-ts",children:"86400 * 7\n"})}),"\n",(0,o.jsx)(s.h4,{id:"source-3",children:"Source"}),"\n",(0,o.jsx)(s.p,{children:(0,o.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/d23a4a12/packages/core/src/utils/cookie.ts#L32",children:"packages/core/src/utils/cookie.ts:32"})}),"\n",(0,o.jsx)(s.hr,{}),"\n",(0,o.jsx)(s.h3,{id:"name",children:"name?"}),"\n",(0,o.jsxs)(s.blockquote,{children:["\n",(0,o.jsxs)(s.p,{children:[(0,o.jsx)(s.strong,{children:"name"}),"?: ",(0,o.jsx)(s.code,{children:"string"})]}),"\n"]}),"\n",(0,o.jsx)(s.p,{children:"Name of the cookie"}),"\n",(0,o.jsx)(s.h4,{id:"source-4",children:"Source"}),"\n",(0,o.jsx)(s.p,{children:(0,o.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/d23a4a12/packages/core/src/utils/cookie.ts#L49",children:"packages/core/src/utils/cookie.ts:49"})}),"\n",(0,o.jsx)(s.hr,{}),"\n",(0,o.jsx)(s.h3,{id:"path",children:"path?"}),"\n",(0,o.jsxs)(s.blockquote,{children:["\n",(0,o.jsxs)(s.p,{children:[(0,o.jsx)(s.strong,{children:"path"}),"?: ",(0,o.jsx)(s.code,{children:"string"})]}),"\n"]}),"\n",(0,o.jsx)(s.h4,{id:"default-2",children:"Default"}),"\n",(0,o.jsx)(s.pre,{children:(0,o.jsx)(s.code,{className:"language-ts",children:"/\n"})}),"\n",(0,o.jsx)(s.h4,{id:"source-5",children:"Source"}),"\n",(0,o.jsx)(s.p,{children:(0,o.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/d23a4a12/packages/core/src/utils/cookie.ts#L36",children:"packages/core/src/utils/cookie.ts:36"})}),"\n",(0,o.jsx)(s.hr,{}),"\n",(0,o.jsx)(s.h3,{id:"samesite",children:"sameSite?"}),"\n",(0,o.jsxs)(s.blockquote,{children:["\n",(0,o.jsxs)(s.p,{children:[(0,o.jsx)(s.strong,{children:"sameSite"}),"?: ",(0,o.jsx)(s.code,{children:'"strict"'})," | ",(0,o.jsx)(s.code,{children:'"none"'})," | ",(0,o.jsx)(s.code,{children:'"lax"'})]}),"\n"]}),"\n",(0,o.jsx)(s.h4,{id:"default-3",children:"Default"}),"\n",(0,o.jsx)(s.pre,{children:(0,o.jsx)(s.code,{className:"language-ts",children:"lax\n"})}),"\n",(0,o.jsx)(s.h4,{id:"source-6",children:"Source"}),"\n",(0,o.jsx)(s.p,{children:(0,o.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/d23a4a12/packages/core/src/utils/cookie.ts#L19",children:"packages/core/src/utils/cookie.ts:19"})}),"\n",(0,o.jsx)(s.hr,{}),"\n",(0,o.jsx)(s.h3,{id:"secure",children:"secure?"}),"\n",(0,o.jsxs)(s.blockquote,{children:["\n",(0,o.jsxs)(s.p,{children:[(0,o.jsx)(s.strong,{children:"secure"}),"?: ",(0,o.jsx)(s.code,{children:"boolean"})]}),"\n"]}),"\n",(0,o.jsx)(s.p,{children:"If not set will be true if https request and false otherwise\nIf defined it will be set to the value"}),"\n",(0,o.jsx)(s.h4,{id:"source-7",children:"Source"}),"\n",(0,o.jsx)(s.p,{children:(0,o.jsx)(s.a,{href:"https://github.com/loopingz/webda.io/blob/d23a4a12/packages/core/src/utils/cookie.ts#L45",children:"packages/core/src/utils/cookie.ts:45"})})]})}function h(e={}){const{wrapper:s}={...(0,i.M)(),...e.components};return s?(0,o.jsx)(s,{...e,children:(0,o.jsx)(a,{...e})}):a(e)}},4552:(e,s,n)=>{n.d(s,{I:()=>l,M:()=>r});var o=n(11504);const i={},c=o.createContext(i);function r(e){const s=o.useContext(c);return o.useMemo((function(){return"function"==typeof e?e(s):{...s,...e}}),[s,e])}function l(e){let s;return s=e.disableParentContext?"function"==typeof e.components?e.components(i):e.components||i:r(e.components),o.createElement(c.Provider,{value:s},e.children)}}}]);