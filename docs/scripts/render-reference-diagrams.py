"""Render the editable reference-diagrams.json storyboards as accessible SVGs.
Run from any directory: python3 docs/scripts/render-reference-diagrams.py [diagram-id ...]
No raster assets, browser runtime, or third-party Python dependencies required.
"""
from pathlib import Path
import json, re, sys, textwrap
from html import escape
ROOT = Path(__file__).resolve().parents[1]
PATH = re.search(r'"(M191[^"\n]+)"', (ROOT/'src/components/WebdaJigsaw.tsx').read_text())[1]
COLORS=[('#8cbbeb','#435f7e'),('#81bf6b','#426747'),('#f4aa58','#926336'),('#b4a0ed','#68578a')]
ICONS={
 'code':'<rect x="0" y="0" width="50" height="50" rx="6"/><path d="M13 15 L6 25 L13 35 M37 15 L44 25 L37 35 M29 13 L21 37"/>',
 'file':'<path d="M4 0 H34 L47 13 V50 H4Z M34 0 V13 H47 M14 23 H35 M14 33 H35 M14 43 H27"/>',
 'database':'<path d="M0 10 V40 C0 54 50 54 50 40 V10"/><ellipse cx="25" cy="10" rx="25" ry="10"/><path d="M0 25 C0 39 50 39 50 25"/>',
 'shield':'<path d="M25 0 L48 9 V26 Q45 42 25 51 Q5 42 2 26 V9Z"/><path d="M13 25 L22 34 L37 17"/>',
 'key':'<circle cx="15" cy="16" r="12"/><path d="M24 25 L47 48 M33 34 L40 27 M40 41 L47 34"/>',
 'queue':'<rect x="0" y="0" width="50" height="12" rx="3"/><rect x="0" y="19" width="50" height="12" rx="3"/><rect x="0" y="38" width="50" height="12" rx="3"/>',
 'server':'<rect x="0" y="0" width="50" height="20" rx="4"/><rect x="0" y="30" width="50" height="20" rx="4"/><path d="M9 10 H12 M9 40 H12 M22 10 H40 M22 40 H40"/>',
 'user':'<circle cx="25" cy="13" r="11"/><path d="M4 50 V43 C4 23 46 23 46 43 V50Z"/>',
 'clock':'<circle cx="25" cy="25" r="24"/><path d="M25 9 V25 L37 33"/>',
 'graph':'<circle cx="8" cy="10" r="7"/><circle cx="42" cy="10" r="7"/><circle cx="25" cy="43" r="7"/><path d="M15 10 H35 M11 16 L22 37 M39 16 L28 37"/>',
 'check':'<circle cx="25" cy="25" r="24"/><path d="M12 25 L22 35 L39 15"/>',
}
def render(d):
 n=len(d['nodes']);rows=max(node.get('row',i//3) for i,node in enumerate(d['nodes']))+1
 foot=150+rows*265; notes=d.get('notes',[]);height=foot+55+len(notes)*26
 a=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 {height}" role="img" aria-labelledby="title description">',f'<title id="title">{escape(d["title"])}</title>',f'<desc id="description">{escape(d["alt"])}</desc>',f'<defs><path id="piece" d="{PATH}"/><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="var(--line)" stroke-width="1.3"/></marker></defs>', '''<style>
:root{--ink:#202b40;--muted:#52627a;--line:#71829c;--surface:#fff;--pale:#eef3f9}
@media(prefers-color-scheme:dark){:root{--ink:#f1f5ff;--muted:#b0bfda;--line:#899bb8;--surface:#1b1b1d;--pale:#282d38}}
text{font-family:Inter,system-ui,-apple-system,sans-serif;fill:var(--ink)}.title{font-size:31px;font-weight:650}.label{font-size:22px;font-weight:650}.detail{font-size:18px;fill:var(--muted)}.line{fill:none;stroke:var(--line);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
</style>''']
 def text(x,y,value,cls='detail',anchor='middle'):
  a.append(f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">{escape(value)}</text>')
 text(48,56,d['title'],'title','start');text(48,91,d['subtitle'],'detail','start')
 positions=[]
 for i,node in enumerate(d['nodes']):
  row=node.get('row',i//3);col=node.get('col',(i%3 if row%2==0 else 2-i%3));positions.append((210+390*col,170+265*row))
 # Sequence connectors snake between rows; explicit graph edges use the same readable grid.
 edges=d.get('edges',[(i,i+1,'') for i in range(n-1)])
 for edge in edges:
  source,target,*label=edge;x,y=positions[source];xx,yy=positions[target]
  if y==yy:
   sign=1 if xx>x else -1;path=f'M{x+sign*120} {y+45} H{xx-sign*120}';lx=(x+xx)/2;ly=y+25
  elif x==xx:
   path=f'M{x} {y+215} V{yy-10}';lx=x+16;ly=(y+215+yy-10)/2
  else:
   mid=(y+215+yy-10)/2;path=f'M{x} {y+215} V{mid} H{xx} V{yy-10}';lx=(x+xx)/2;ly=mid-8
  a.append(f'<path d="{path}" class="line" marker-end="url(#arrow)"/>')
  if label and label[0]:text(lx,ly,label[0],anchor='start' if x==xx else 'middle')
 for i,(node,(x,y)) in enumerate(zip(d['nodes'],positions)):
  top,side=COLORS[node.get('color',i)%len(COLORS)]
  # Upright icons share a 50-unit box and sit low on the canonical isometric piece.
  a.append(f'<g transform="translate({x+27} {y+60})">')
  for off in range(16,-1,-1):a.append(f'<use href="#piece" transform="matrix(.43 .248 -.43 .248 0 {-78+off})" fill="{side if off else top}"/>')
  a.append(f'<g transform="translate(-52 -47)" stroke="#16213b" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">{ICONS[node.get("icon","code")]}</g></g>')
  if d.get('numbered',True):
   a.append(f'<circle cx="{x-112}" cy="{y+12}" r="15" fill="var(--pale)"/>');text(x-112,y+18,str(i+1))
  labels=textwrap.wrap(node['title'],27)
  for k,label in enumerate(labels):text(x,y+133+k*25,label,'label')
  details=node.get('lines',[])
  for k,detail in enumerate(details):
   if len(detail)>39:raise ValueError(f'{d["id"]}: line too long: {detail}')
   text(x,y+139+len(labels)*25+k*23,detail)
  if len(labels)>2 or len(details)>2:raise ValueError(f'{d["id"]}: too much node text')
 a.append(f'<path d="M48 {foot-5} H1152" class="line" opacity=".3"/>')
 for k,note in enumerate(notes):text(48,foot+30+k*26,note,'detail','start')
 a.append('</svg>');(ROOT/f'static/img/concepts/{d["id"]}.svg').write_text('\n'.join(a)+'\n')
 return height
all_data=json.loads((ROOT/'scripts/reference-diagrams.json').read_text())
for d in all_data:
 if len(sys.argv)>1 and d['id'] not in sys.argv[1:]:continue
 d['height']=render(d)
(ROOT/'scripts/reference-diagrams.json').write_text(json.dumps(all_data,indent=2,ensure_ascii=False)+'\n')
# Generate only the compact UI manifest; editable diagram definitions stay out of the JS bundle.
manifest={d['id']:{k:d[k] for k in ('title','alt','height','caption')} for d in all_data if 'height' in d}
(ROOT/'src/components/ReferenceDiagram/manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
