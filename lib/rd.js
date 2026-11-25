(function(){
if (window.__rd) { return; }
var CUR=0;
function isTxt(n){ var p=n.parentNode; return p && p.nodeName!=='SCRIPT' && p.nodeName!=='STYLE' && p.nodeName!=='NOSCRIPT'; }
function texts(root){ var w=document.createTreeWalker(root||document.body,NodeFilter.SHOW_TEXT,null), out=[], n;
  while((n=w.nextNode())){ if(isTxt(n)) out.push(n); } return out; }
function root(ch){ var c=document.querySelector('.__chap[data-ch="'+ch+'"]'); if(c) return c;
  return (ch===CUR && !document.querySelector('.__chap')) ? document.body : null; }
function elOf(node){ return node.nodeType===1?node:node.parentNode; }
function rootOf(node){ var e=elOf(node), c=e&&e.closest?e.closest('.__chap'):null; return c||document.body; }
function chOf(node){ var e=elOf(node), c=e&&e.closest?e.closest('.__chap'):null; return c?parseInt(c.getAttribute('data-ch')):CUR; }
function off(node,o,rt){ var ts=texts(rt), n=0, r=document.createRange(); r.setStart(node,o); r.collapse(true);
  for(var i=0;i<ts.length;i++){ var t=ts[i]; if(t===node) return n+o;
    if(r.comparePoint(t,t.length)===-1) n+=t.length; else break; }
  return n; }
function pos(o,isEnd,rt){ var ts=texts(rt), n=0, last=null;
  for(var i=0;i<ts.length;i++){ var l=ts[i].length;
    if(isEnd ? ((o<=n+l && o>n)||(o===0&&i===0&&l>0)) : (o<n+l)) return {node:ts[i],off:o-n};
    n+=l; last=ts[i]; }
  return last?{node:last,off:last.length}:null; }
function rng(s,e,ch){ var rt=root(ch); if(!rt) return null; var a=pos(s,false,rt), b=pos(e,true,rt); if(!a||!b) return null;
  var r=document.createRange(); r.setStart(a.node,a.off); r.setEnd(b.node,b.off); return r; }
function txt(ch){ var rt=root(ch)||document.body; return texts(rt).map(function(t){return t.data;}).join(''); }
var HL=[];
var SETN=[];
function hname(c){ return c.charAt(0)==='#' ? 'hl-c'+c.substring(1).toLowerCase() : 'hl-'+c; }
function ensureRule(c){ if(c.charAt(0)!=='#') return; var id='__rdc'+c.substring(1), st=document.getElementById(id);
  if(!st){ st=document.createElement('style'); st.id=id; var hex=c; if(!/^#[0-9a-fA-F]{6}$/.test(hex)) hex='#ffe066';
    st.textContent='::highlight('+hname(c)+'){background-color:'+hex+';color:#000}'; document.head.appendChild(st); } }
var NATIVE=!!(window.CSS&&CSS.highlights&&window.Highlight)&&!window.__rdFB;
var PAL={yellow:'#ffe066',green:'#a8e6a1',blue:'#9fd3ff',pink:'#ffb3d1',violet:'#d2b4f5'};
function colHex(c){ if(c&&c.charAt(0)==='#'&&/^#[0-9a-fA-F]{6}$/.test(c)) return c; return PAL[c]||'#ffe066'; }
/* metodo alternativo (Safari < 17.2): evidenziazioni con <span> attorno al testo */
function unwrapKind(kind){ var l=document.querySelectorAll('span[data-rdh="'+kind+'"]'), ps=[];
  for(var i=0;i<l.length;i++){ var s=l[i], p=s.parentNode; if(!p) continue; while(s.firstChild) p.insertBefore(s.firstChild,s); p.removeChild(s); if(ps.indexOf(p)<0) ps.push(p); }
  ps.forEach(function(p){ try{ p.normalize(); }catch(e){} }); }
function wrapRange(r,kind,hex){ var anc=r.commonAncestorContainer, list=[];
  if(anc.nodeType===3){ list.push(anc); }
  else { var w=document.createTreeWalker(anc,NodeFilter.SHOW_TEXT,null), n; while((n=w.nextNode())){ if(isTxt(n)&&r.intersectsNode(n)) list.push(n); } }
  for(var i=list.length-1;i>=0;i--){ var t=list[i], s=(t===r.startContainer)?r.startOffset:0, e=(t===r.endContainer)?r.endOffset:t.length;
    if(e<=s) continue; var mid=t; if(e<t.length) t.splitText(e); if(s>0) mid=t.splitText(s);
    var sp=document.createElement('span'); sp.setAttribute('data-rdh',kind); sp.style.cssText='background-color:'+hex+';color:#000';
    mid.parentNode.insertBefore(sp,mid); sp.appendChild(mid); } }
function applyHL(){ if(!NATIVE){ unwrapKind('hl');
    HL.forEach(function(h){ var r=rng(h.start,h.end,h.ch); if(r) wrapRange(r,'hl',colHex(h.color)); }); return; }

  SETN.forEach(function(n){ CSS.highlights.delete(n); }); SETN=[];
  var by={}; HL.forEach(function(h){ var r=rng(h.start,h.end,h.ch); if(r){ (by[h.color]=by[h.color]||[]).push(r); } });
  Object.keys(by).forEach(function(c){ ensureRule(c); var H=new Highlight(); by[c].forEach(function(r){H.add(r);}); var n=hname(c); CSS.highlights.set(n,H); SETN.push(n); }); }
if(!document.getElementById('__rdhl')){ var st=document.createElement('style'); st.id='__rdhl';
  st.textContent='::highlight(hl-yellow){background-color:#ffe066;color:#000}::highlight(hl-green){background-color:#a8e6a1;color:#000}'
   +'::highlight(hl-blue){background-color:#9fd3ff;color:#000}::highlight(hl-pink){background-color:#ffb3d1;color:#000}::highlight(hl-violet){background-color:#d2b4f5;color:#000}'
   +'::highlight(tts){background-color:#ffb347;color:#000}::highlight(kw){background-color:#ff9f43;color:#000}'
   +'.__chap{display:block}.__chap + .__chap{border-top:1px solid rgba(128,128,128,.55);margin-top:2.2em;padding-top:2.2em}';
  document.head.appendChild(st); }
window.__rd={
  clear:function(){ var c=document.querySelectorAll('.__chap'); for(var i=0;i<c.length;i++) c[i].remove(); },
  hlAll:function(){ return HL; },
  setCur:function(i){ CUR=i; },
  wrap:function(i){ CUR=i; if(document.querySelector('.__chap')) return;
    var d=document.createElement('div'); d.className='__chap'; d.setAttribute('data-ch',i);
    while(document.body.firstChild) d.appendChild(document.body.firstChild); document.body.appendChild(d); },
  text:function(ch){ return txt(ch===undefined?CUR:ch); },
  selection:function(){ var s=window.getSelection(); if(!s||s.rangeCount===0||s.isCollapsed) return null;
    var r=s.getRangeAt(0), rt=rootOf(r.startContainer), ch=chOf(r.startContainer), a=off(r.startContainer,r.startOffset,rt), b, inside=rt.contains(r.endContainer);
    var tx=txt(ch); b=inside?off(r.endContainer,r.endOffset,rt):tx.length;
    if(b<=a) return null;
    return JSON.stringify({start:a,end:b,ch:ch,text:inside?s.toString():tx.substring(a,b),ctx:tx.substring(Math.max(0,a-60),Math.min(tx.length,b+60)).replace(/\s+/g,' ')}); },
  scrollToRange:function(s,e,ch){ if(ch===undefined) ch=CUR; var r=rng(s,e,ch); if(!r) return; var rc=r.getBoundingClientRect();
    window.scrollTo(0, window.scrollY+rc.top-window.innerHeight/3);
    if(NATIVE){ var H=new Highlight(); H.add(r); CSS.highlights.set('kw',H);
      setTimeout(function(){ CSS.highlights.delete('kw'); },4000); }
    else { unwrapKind('kw'); var r2=rng(s,e,ch); if(r2) wrapRange(r2,'kw','#ff9f43'); setTimeout(function(){ unwrapKind('kw'); },4000); } },
  setHighlights:function(list){ HL=list||[]; applyHL(); },
  hlAt:function(x,y){ if(!document.caretRangeFromPoint) return null; var r=document.caretRangeFromPoint(x,y); if(!r) return null;
    var rt=rootOf(r.startContainer), ch=chOf(r.startContainer), o=off(r.startContainer,r.startOffset,rt), best=null;
    HL.forEach(function(h){ if(h.ch===ch && o>=h.start && o<h.end) best=h.id; }); return best; },
  scrollToHl:function(id){ var h=HL.filter(function(x){return x.id===id;})[0]; if(!h) return; var r=rng(h.start,h.end,h.ch); if(!r) return;
    var rc=r.getBoundingClientRect(); window.scrollTo(0, window.scrollY+rc.top-window.innerHeight/3); },
  ttsSet:function(s,e,ch){ if(ch===undefined) ch=CUR; var r=rng(s,e,ch); if(!r) return; if(NATIVE){ var H=new Highlight(); H.add(r); CSS.highlights.set('tts',H); }
    else { unwrapKind('tts'); r=rng(s,e,ch); if(!r) return; wrapRange(r,'tts','#ffb347'); r=rng(s,e,ch); if(!r) return; }
    var rc=r.getBoundingClientRect(); if(rc.top<40||rc.bottom>window.innerHeight-40) window.scrollTo(0, window.scrollY+rc.top-window.innerHeight/3); },
  ttsClear:function(){ if(NATIVE) CSS.highlights.delete('tts'); else unwrapKind('tts'); },
  textFrom:function(top,ch){ var rt, s=0;
    if(ch===undefined||ch===null){ ch=CUR;
      if(top){ var cs=document.querySelectorAll('.__chap');
        for(var k=0;k<cs.length;k++){ if(cs[k].getBoundingClientRect().bottom>10){ ch=parseInt(cs[k].getAttribute('data-ch')); break; } } } }
    rt=root(ch)||document.body; var ts=texts(rt), t=ts.map(function(x){return x.data;}).join('');
    if(top){ var n=0; for(var i=0;i<ts.length;i++){ var tn=ts[i];
        if(tn.data.trim().length>0){ var r=document.createRange(); r.selectNodeContents(tn); var rc=r.getBoundingClientRect();
          if(rc.height>0 && rc.bottom>10){ s=n; break; } }
        n+=tn.length; } }
    return JSON.stringify({text:t,start:s,ch:ch}); },
  textOf:function(ch){ if(!root(ch)) return null; return JSON.stringify({text:txt(ch),start:0,ch:ch}); },
  pos:function(){ var cs=document.querySelectorAll('.__chap'); if(!cs.length) return null;
    var cur=null, lo=1e9, hi=-1;
    for(var i=0;i<cs.length;i++){ var ch=parseInt(cs[i].getAttribute('data-ch')); lo=Math.min(lo,ch); hi=Math.max(hi,ch);
      var rc=cs[i].getBoundingClientRect(); if(cur===null && rc.bottom>24) cur={ch:ch,rc:rc}; }
    if(cur===null){ var l=cs[cs.length-1]; cur={ch:parseInt(l.getAttribute('data-ch')),rc:l.getBoundingClientRect()}; }
    var span=Math.max(1,cur.rc.height-window.innerHeight), frac=Math.min(1,Math.max(0,-cur.rc.top/span));
    var sh=document.documentElement.scrollHeight;
    return JSON.stringify({ch:cur.ch,frac:frac,lo:lo,hi:hi,top:window.scrollY<window.innerHeight,bot:(sh-window.scrollY-window.innerHeight)<window.innerHeight*1.5}); },
  setFrac:function(ch,f){ var c=root(ch); if(!c) return; var rc=c.getBoundingClientRect(), span=Math.max(0,rc.height-window.innerHeight);
    window.scrollTo(0, window.scrollY+rc.top+span*f); },
  scrollToCh:function(ch){ var c=root(ch); if(!c) return; window.scrollTo(0, window.scrollY+c.getBoundingClientRect().top); },
  append:function(i,src,base,where){ if(document.querySelector('.__chap[data-ch="'+i+'"]')) return 0;
    var doc=null; try{ doc=new DOMParser().parseFromString(src,'application/xhtml+xml'); if(doc.getElementsByTagName('parsererror').length) doc=null; }catch(e){ doc=null; }
    if(!doc) doc=new DOMParser().parseFromString(src,'text/html');
    var body=doc.body||doc.getElementsByTagName('body')[0]; if(!body) return 0;
    function ab(u){ try{ return new URL(u,base).href; }catch(e){ return u; } }
    var hs=doc.querySelectorAll('link,style');
    for(var k=0;k<hs.length;k++){ var h=hs[k];
      if(h.nodeName.toLowerCase()==='link'){ if(!/stylesheet/i.test(h.getAttribute('rel')||'')) continue; var u=ab(h.getAttribute('href')||''), have=false;
        var ex=document.querySelectorAll('link'); for(var m=0;m<ex.length;m++){ if(ex[m].href===u) have=true; }
        if(!have){ var l=document.createElement('link'); l.rel='stylesheet'; l.href=u; document.head.appendChild(l); } }
      else { var tx=h.textContent, have2=false; var ex2=document.querySelectorAll('style'); for(var m2=0;m2<ex2.length;m2++){ if(ex2[m2].textContent===tx) have2=true; }
        if(!have2){ var s=document.createElement('style'); s.textContent=tx; document.head.appendChild(s); } } }
    var all=body.getElementsByTagName('*');
    for(var j=0;j<all.length;j++){ ['src','poster','href','xlink:href'].forEach(function(a){ var v=all[j].getAttribute(a);
        if(v && !/^(#|[a-z][a-z0-9+.-]*:)/i.test(v)) all[j].setAttribute(a,ab(v)); }); }
    var d=document.createElement('div'); d.className='__chap'; d.setAttribute('data-ch',i);
    for(var q=0;q<body.childNodes.length;q++) d.appendChild(document.importNode(body.childNodes[q],true));
    if(where==='start'){ var first=document.querySelector('.__chap'), h0=document.documentElement.scrollHeight;
      document.body.insertBefore(d,first); window.scrollBy(0,document.documentElement.scrollHeight-h0); }
    else { document.body.appendChild(d); }
    applyHL(); return 1; }
};
})();