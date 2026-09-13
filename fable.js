(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const mini=new URLSearchParams(location.search).get('mini')==='1';
  document.body.classList.toggle('is-mini',mini);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const rows=$('#rows'),search=$('#search'),feedback=$('#feedback');
  const viewerKey='sylvie-songbook-viewer-v1',catalogKey='vv-songbook-preview-v1';
  const cloudEndpoint=document.documentElement.dataset.catalogEndpoint||'',cloudCacheKey='sylvie-cloud-catalog-v1';
  let cloudRequest=null,lastCloudRefresh=0,cloudRevision=0;
  const WEEK=7*24*60*60*1000,pageSize=20;
  const bookmark='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>';
  let songs=[],selected=null,view='all',language='',style='',candidate=null,page=0,feedbackTimer,candidateTurn=0;
  let media=[],recent=[];
  const saved=new Set();
  function readViewer(){
    try{const data=JSON.parse(localStorage.getItem(viewerKey)||'{}');saved.clear();(Array.isArray(data.saved)?data.saved:[]).forEach(id=>saved.add(String(id)));recent=(Array.isArray(data.recent)?data.recent:[]).filter(x=>x&&typeof x.id==='string').slice(0,30);}catch{/* Storage is optional; the catalogue remains usable. */}
  }
  function saveViewer(){try{localStorage.setItem(viewerKey,JSON.stringify({saved:[...saved],recent}));}catch{$('#storage-note').hidden=false;}}
  readViewer();
  const isNew=s=>Number.isFinite(s.createdAt)&&Date.now()>=s.createdAt&&Date.now()-s.createdAt<WEEK;
  const songNumber=s=>String(songs.indexOf(s)+1).padStart(3,'0');
  function matches(){
    const query=search.value.trim().normalize('NFKC').toLocaleLowerCase();
    const list=songs.filter(s=>!s.deletedAt&&(view!=='saved'||saved.has(String(s.id)))&&(view!=='recent'||recent.some(x=>x.id===String(s.id)))&&(view!=='new'||isNew(s))&&(!language||s.language===language)&&(!style||s.style===style)&&(!query||`${s.name} ${s.singer} ${songNumber(s)}`.normalize('NFKC').toLocaleLowerCase().includes(query)));
    return list.sort((a,b)=>view==='recent'?recent.findIndex(x=>x.id===String(a.id))-recent.findIndex(x=>x.id===String(b.id)):Number(isNew(b))-Number(isNew(a))||(isNew(a)?b.createdAt-a.createdAt:(a.order??songs.indexOf(a))-(b.order??songs.indexOf(b))));
  }
  function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function showSlip(song){
    $('#feedback-text').textContent='点歌 '+song.name;feedback.dataset.long=String(song.name.length>30);feedback.hidden=false;
    clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>{feedback.hidden=true;},6200);
    feedback.getAnimations?.().forEach(a=>a.cancel());
    if(!reduced.matches&&!document.body.classList.contains('static-mode'))feedback.animate([{transform:'translate(-50%,6px)',opacity:0},{transform:'translate(-50%,0)',opacity:1}],{duration:200,easing:'ease-out'});
  }
  function recordChoice(song,notify=true){const changed=selected!==String(song.id);selected=String(song.id);recent=[{id:String(song.id),at:Date.now()},...recent.filter(x=>x.id!==String(song.id))].slice(0,30);saveViewer();const index=matches().findIndex(s=>String(s.id)===selected);if(index>=0)page=Math.floor(index/pageSize);render();if(notify)showSlip(song);else{feedback.hidden=true;clearTimeout(feedbackTimer);}const row=[...rows.children].find(r=>r.dataset.song===selected);row?.scrollIntoView({block:'nearest',behavior:reduced.matches||document.body.classList.contains('static-mode')?'instant':'smooth'});const button=row?.querySelector('.select-song');button?.focus({preventScroll:true});if(changed&&button&&!reduced.matches&&!document.body.classList.contains('static-mode')){const leaf=button.querySelector('.request-token');leaf?.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(-180deg)'}],{duration:760,easing:'cubic-bezier(.4,0,.2,1)'});}}
  function legacyCopy(text){
    const previous=document.activeElement,selection=window.getSelection(),ranges=[];
    for(let i=0;i<(selection?.rangeCount||0);i++)ranges.push(selection.getRangeAt(i).cloneRange());
    const field=document.createElement('textarea');field.value=text;field.readOnly=true;
    field.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px';
    (document.querySelector('dialog[open]')||document.body).append(field);
    let copied=false;
    try{field.focus({preventScroll:true});field.select();field.setSelectionRange(0,text.length);copied=document.execCommand?.('copy')===true;}catch{}
    finally{field.remove();previous?.focus?.({preventScroll:true});if(selection){selection.removeAllRanges();ranges.forEach(range=>selection.addRange(range));}}
    return copied;
  }
  async function copyRequest(text){
    // Invoke the browser API directly inside the click. Older / embedded browsers may need selection copying.
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}}catch{}
    if(!legacyCopy(text))throw Error('Clipboard unavailable');
  }
  async function choose(song,notify=true){
    const text='点歌 '+song.name;
    try{await copyRequest(text);recordChoice(song,notify);}
    catch{feedback.hidden=true;clearTimeout(feedbackTimer);$('#manual-copy-text').value=text;$('#manual-copy').dataset.song=String(song.id);$('#manual-copy').dataset.notify=String(notify);$('#manual-copy').showModal();$('#manual-copy-text').focus();$('#manual-copy-text').select();}
  }
  function render(){
    const result=matches();page=Math.max(0,Math.min(page,Math.ceil(result.length/pageSize)-1));
    rows.replaceChildren();$('#result-count').textContent=`${result.length} 首`;
    const available=songs.filter(s=>!s.deletedAt),ids=new Set(available.map(s=>String(s.id)));
    $('#saved-count').textContent=available.filter(s=>saved.has(String(s.id))).length;$('#recent-count').textContent=recent.filter(x=>ids.has(x.id)).length;$('#new-count').textContent=available.filter(isNew).length;
    $('#random').disabled=!result.length;$('#empty').hidden=!!result.length;
    $('#clear-recent').hidden=view!=='recent'||!recent.length;
    $('#empty-message').textContent=view==='saved'?'点亮歌曲旁的书签，把喜欢的歌留在这里。':view==='recent'?'选歌后会自动保留最近记录。':'试试清空搜索，或减少筛选条件。';
    $('#pagination').hidden=result.length<=pageSize;
    $('#page-count').textContent=`${page+1} / ${Math.max(1,Math.ceil(result.length/pageSize))}`;
    $('#page-prev').disabled=page===0;$('#page-next').disabled=(page+1)*pageSize>=result.length;
    for(const song of result.slice(page*pageSize,(page+1)*pageSize)){
      const id=String(song.id),row=make('article','track'+(selected===id?' chosen':''));row.dataset.song=id;
      const number=make('span','track-number num',songNumber(song));
      const names=make('div','track-names'),title=make('strong','',song.name);
      if(isNew(song))title.append(make('small','new-badge','NEW'));
      names.append(title,make('span','artist',song.singer));
      const clip=media.find(m=>m.songName===song.name);
      if(clip){const preview=make('a','song-preview','看演唱 ↗');preview.href=clip.url;preview.target='_blank';preview.rel='noreferrer';names.append(preview);}
      const favorite=make('button','favorite');favorite.type='button';favorite.innerHTML=bookmark;
      favorite.setAttribute('aria-pressed',String(saved.has(id)));favorite.setAttribute('aria-label',(saved.has(id)?'取消收藏 ':'收藏 ')+song.name);
      favorite.addEventListener('click',()=>{saved.has(id)?saved.delete(id):saved.add(id);saveViewer();render();const target=[...rows.querySelectorAll('.track')].find(e=>e.dataset.song===id)?.querySelector('.favorite')||$('[data-view="'+view+'"]');target?.focus({preventScroll:true});});
      const select=make('button','select-song');select.type='button';select.setAttribute('aria-label',(selected===id?'已选，重新复制点歌 ':'复制点歌 ')+song.name);select.setAttribute('aria-pressed',String(selected===id));
      const token=make('span','request-token');token.setAttribute('aria-hidden','true');
      const front=make('span','token-face token-blue'),back=make('span','token-face token-red');front.dataset.label='点歌';back.dataset.label='已选';token.append(front,back);select.append(token,make('span','sr-only',selected===id?'已选':'点歌'));select.addEventListener('click',()=>choose(song));
      row.append(number,names,favorite,select);rows.append(row);
    }
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  }
  function updateFilters(){
    document.querySelectorAll('[data-field]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.field==='language'?language:style)===b.dataset.value)));
    $('#filter-label').textContent=language||style?[language,style].filter(Boolean).join(' · '):'筛选';
  }
  function setupFilters(){
    for(const field of ['language','style']){
      const target=$('#'+field+'-choices');target.replaceChildren();
      for(const value of ['',...new Set(songs.filter(s=>!s.deletedAt).map(s=>s[field]).filter(Boolean))]){
        const b=make('button','',value||'全部');b.type='button';b.dataset.field=field;b.dataset.value=value;
        b.addEventListener('click',()=>{if(field==='language')language=value;else style=value;page=0;updateFilters();render();});target.append(b);
      }
    }updateFilters();
  }
  function reset(){search.value='';language='';style='';view='all';page=0;updateFilters();render();}
  function nextCandidate(){
    const eligible=matches(),alternatives=eligible.filter(s=>String(s.id)!==String(candidate?.id));
    const pool=alternatives.length?alternatives:eligible;if(!pool.length)return;
    $('#another').disabled=eligible.length<2;
    candidate=pool[Math.floor(Math.random()*pool.length)];candidateTurn++;
    $('#candidate-name').textContent=candidate.name;$('#candidate-singer').textContent=candidate.singer;
    $('#candidate-number').textContent='候选 '+String(candidateTurn).padStart(2,'0');
    for(const id of ['candidate-name','candidate-singer','candidate-number']){
      const text=$('#'+id);text.getAnimations?.().forEach(a=>a.cancel());
      if(!reduced.matches&&!document.body.classList.contains('static-mode'))text.animate([{transform:'translateY(5px)',opacity:.25},{transform:'translateY(0)',opacity:1}],{duration:200,easing:'ease-out'});
    }
  }
  search.addEventListener('input',()=>{page=0;render();});
  search.addEventListener('keydown',e=>{if(e.key==='Escape'){search.value='';page=0;render();}});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;page=0;render();}));
  $('#reset').addEventListener('click',reset);
  $('#reset-filter').addEventListener('click',()=>{language='';style='';page=0;updateFilters();render();});
  $('#dismiss-feedback').addEventListener('click',()=>{feedback.hidden=true;clearTimeout(feedbackTimer);});
  $('#clear-recent').addEventListener('click',()=>{recent=[];saveViewer();page=0;render();});
  $('#page-prev').addEventListener('click',()=>{page--;render();$('#catalog').scrollIntoView({block:'start'});});
  $('#page-next').addEventListener('click',()=>{page++;render();$('#catalog').scrollIntoView({block:'start'});});
  document.addEventListener('pointerdown',e=>{if(!$('.filter').contains(e.target))$('.filter').open=false;});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&$('.filter').open){$('.filter').open=false;$('.filter summary').focus();}
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target.closest('input,textarea,[contenteditable="true"]')&&!document.querySelector('dialog[open]')){e.preventDefault();if(horizontal)goChapter(1,false);if(theme==='atlas')goAtlas(2,false);if(theme==='fable')goFable(5,false);search.focus();}
  });
  $('#random').addEventListener('click',()=>{nextCandidate();if(candidate)$('#candidate').showModal();});
  $('#another').addEventListener('click',nextCandidate);
  $('#choose-candidate').addEventListener('click',()=>{if(candidate){$('#candidate').close();choose(candidate,false);}});
  $('#manual-copy-done').addEventListener('click',()=>{const song=songs.find(s=>String(s.id)===$('#manual-copy').dataset.song),notify=$('#manual-copy').dataset.notify!=='false';$('#manual-copy').close();if(song)recordChoice(song,notify);});
  window.addEventListener('storage',e=>{if(e.key===viewerKey){readViewer();render();}if(e.key===catalogKey)loadCatalog();});
  async function loadCatalog(){
    try{
      if(cloudEndpoint){
        let cached=null;try{cached=JSON.parse(localStorage.getItem(cloudCacheKey)||'null');}catch{}
        const snapshot=validCloudCatalog(cached)?cached.songs:await fetch('./songs.json').then(r=>{if(!r.ok)throw Error();return r.json();});
        songs=snapshot;cloudRevision=validCloudCatalog(cached)?cached.revision:0;setupFilters();render();refreshCloudCatalog();return;
      }
      let data=null;try{const stored=localStorage.getItem(catalogKey);if(stored)data=JSON.parse(stored);}catch{/* Read the source catalogue even if storage is blocked or malformed. */}
      if(!Array.isArray(data))data=await fetch('./songs.json').then(r=>{if(!r.ok)throw Error();return r.json();});
      if(!Array.isArray(data))throw Error();songs=data;setupFilters();render();
    }catch{$('#empty').hidden=false;$('#empty-message').textContent='歌单暂时无法读取，请刷新页面。';$('#random').disabled=true;}
  }
  function validCloudCatalog(data){return data&&Number.isInteger(data.revision)&&data.revision>0&&Array.isArray(data.songs)&&data.songs.length<=5000&&data.songs.every(s=>s&&s.id!=null&&typeof s.name==='string'&&(s.singer==null||typeof s.singer==='string'));}
  async function refreshCloudCatalog(){
    if(!cloudEndpoint||cloudRequest||document.querySelector('dialog[open]'))return;
    lastCloudRefresh=Date.now();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    cloudRequest=controller;
    try{
      const response=await fetch(cloudEndpoint,{credentials:'omit',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error();
      const data=await response.json();if(!validCloudCatalog(data))throw Error();
      if(data.revision!==cloudRevision&&!document.querySelector('dialog[open]')){songs=data.songs;cloudRevision=data.revision;if(selected&&!songs.some(s=>String(s.id)===selected&&!s.deletedAt))selected=null;setupFilters();render();try{localStorage.setItem(cloudCacheKey,JSON.stringify(data));}catch{}}
    }catch{/* Keep the most recently available catalogue when the connection is unavailable. */}
    finally{clearTimeout(timer);cloudRequest=null;}
  }
  window.addEventListener('focus',()=>{if(Date.now()-lastCloudRefresh>15000)refreshCloudCatalog();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastCloudRefresh>15000)refreshCloudCatalog();});
  if(cloudEndpoint)setInterval(()=>{if(document.visibilityState==='visible')refreshCloudCatalog();},60000);
  fetch('submissions.json').then(r=>r.json()).then(data=>{media=data;if(songs.length)render();}).catch(()=>{});
  loadCatalog();
  const theme='fable',horizontal=false;
  const rail=$('#fable-rail'),panels=[...document.querySelectorAll('[data-page]')];
  let currentPage=0,scrollFrame=0,wheelSum=0,lastWheel=0,wheelLock=0,quietPreference=false;
  const running=new Set();
  let openingRequest=0,openingLayer=null;
  function stopOpening(){
    openingRequest++;
    for(const a of running)a.cancel();
    openingLayer?.remove();openingLayer=null;
    document.body.classList.remove('is-opening');
  }
  const quiet=()=>reduced.matches||quietPreference;
  const pictureJobs=new Map();
  function preparePicture(index){
    const frame=panels[index]?.querySelector('.picture-window'),img=frame?.querySelector('img');
    if(!img)return Promise.resolve();
    if(pictureJobs.has(index))return pictureJobs.get(index);
    frame.dataset.imageState='pending';frame.querySelector('.picture-load-state').hidden=true;
    img.loading='eager';
    const job=img.decode().then(()=>{frame.dataset.imageState='ready';frame.querySelector('.picture-load-state').hidden=true;}).catch(()=>{
      if(img.complete&&img.naturalWidth){frame.dataset.imageState='ready';return;}
      frame.dataset.imageState='error';frame.querySelector('.picture-load-state').hidden=false;pictureJobs.delete(index);
    });
    pictureJobs.set(index,job);return job;
  }
  document.querySelectorAll('.picture-load-state').forEach(button=>button.addEventListener('click',()=>{
    const frame=button.closest('.picture-window'),img=frame.querySelector('img');
    img.src=img.src;preparePicture(Number(button.closest('[data-page]').dataset.page));
  }));
  function prepareNearby(index){
    preparePicture(index).then(()=>{if(currentPage===index){preparePicture(index-1);preparePicture(index+1);}});
  }
  try{quietPreference=localStorage.getItem('sylvie-reduced-motion')==='true';}catch{}
  function applyMotionPreference(){
    document.body.classList.toggle('static-mode',quiet());
    $('#motion-toggle').setAttribute('aria-pressed',String(quiet()));
    if(quiet())stopOpening();
    if(quiet())document.querySelectorAll('#feedback,#candidate-content>*').forEach(el=>el.getAnimations?.().forEach(a=>a.cancel()));
  }
  function animatePart(el,frames,options){
    if(!el||quiet())return;
    const a=el.animate(frames,{duration:850,easing:'cubic-bezier(.18,.75,.24,1)',...options});
    running.add(a);a.finished.then(()=>running.delete(a),()=>running.delete(a));return a;
  }
  function syncRail(){
    const width=rail.clientWidth||innerWidth;
    const previousPage=currentPage;
    currentPage=Math.max(0,Math.min(panels.length-1,Math.round(rail.scrollLeft/width)));
    if(previousPage!==currentPage)prepareNearby(currentPage);
    document.body.dataset.currentPage=String(currentPage);
    panels.forEach((p,i)=>p.inert=i!==currentPage);
    document.querySelectorAll('.chapter-links [data-fable-go]').forEach(b=>{
      const index=Number(b.dataset.fableGo);
      b.setAttribute('aria-pressed',String(index===currentPage||(index===1&&currentPage>1&&currentPage<5)));
    });
    $('#fable-position').textContent=String(currentPage+1).padStart(2,'0')+' / 07';
    $('#fable-prev').disabled=currentPage===0;$('#fable-next').disabled=currentPage===panels.length-1;
    $('#fable-progress').style.width=((rail.scrollLeft/width+1)/panels.length*100)+'%';
    // Environment and principal picture move together. There is no long empty scroll range.
    $('.world-scene').style.transform=quiet()?'none':`translate3d(${-rail.scrollLeft/width*.3}vw,0,0)`;
    scrollFrame=0;
  }
  function goFable(index,animate=true){
    index=Math.max(0,Math.min(panels.length-1,index));
    if(index!==0)stopOpening();
    currentPage=index;wheelSum=0;
    prepareNearby(index);
    rail.scrollTo({left:index*(rail.clientWidth||innerWidth),behavior:animate&&!quiet()?'smooth':'instant'});
    if(!animate||quiet())syncRail();
    history.replaceState(null,'',index===5?'#catalog':'#chapter-'+index);
  }
  function readHash(){return location.hash==='#catalog'?5:Number(location.hash.replace('#chapter-',''))||0;}
  document.querySelectorAll('[data-fable-go]').forEach(b=>b.addEventListener('click',()=>goFable(Number(b.dataset.fableGo))));
  document.querySelectorAll('a[href="#catalog"],a[href="#chapter-0"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();goFable(a.hash==='#catalog'?5:0);if(a.classList.contains('skip-link'))$('#search').focus({preventScroll:true});}));
  $('#fable-prev').addEventListener('click',()=>goFable(currentPage-1));
  $('#fable-next').addEventListener('click',()=>goFable(currentPage+1));
  rail.addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(syncRail);},{passive:true});
  rail.addEventListener('scrollend',()=>{syncRail();history.replaceState(null,'',currentPage===5?'#catalog':'#chapter-'+currentPage);});
  rail.addEventListener('wheel',e=>{
    if(e.ctrlKey||e.target.closest('[data-inner-scroll],input,textarea,dialog,.filter-pop')||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    e.preventDefault();const now=performance.now();if(now<wheelLock)return;
    const delta=e.deltaY*(e.deltaMode===1?20:e.deltaMode===2?rail.clientWidth:1);
    if(now-lastWheel>550||Math.sign(delta)!==Math.sign(wheelSum))wheelSum=0;
    lastWheel=now;wheelSum+=delta;
    if(Math.abs(wheelSum)>=170){const direction=Math.sign(wheelSum);wheelSum=0;wheelLock=now+(quiet()?160:650);goFable(currentPage+direction);}
  },{passive:false});
  document.addEventListener('keydown',e=>{
    if(e.target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
    if(e.key==='ArrowRight'){e.preventDefault();goFable(currentPage+1);}
    if(e.key==='ArrowLeft'){e.preventDefault();goFable(currentPage-1);}
    if(e.key==='Home'&&e.target.closest('.fable-dock')){e.preventDefault();goFable(0);}
    if(e.key==='End'&&e.target.closest('.fable-dock')){e.preventDefault();goFable(6);}
  });
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>goFable(currentPage,false),100);},{passive:true});
  window.addEventListener('hashchange',()=>goFable(readHash()));
  $('#motion-toggle').addEventListener('click',()=>{quietPreference=!quietPreference;try{localStorage.setItem('sylvie-reduced-motion',String(quietPreference));}catch{}applyMotionPreference();});
  reduced.addEventListener('change',applyMotionPreference);applyMotionPreference();
  async function playOpening(){
    stopOpening();goFable(0,false);
    if(quiet())return;
    const request=openingRequest,frame=$('.cover-page .picture-window');
    // The picture is always present underneath. A physical paper leaf opens over it;
    // no loading-dependent reveal, opacity ramp or clipped original image is used.
    const layer=document.createElement('div');layer.className='unroll-layer';layer.setAttribute('aria-hidden','true');
    layer.innerHTML='<div class="unroll-paper"><div class="unroll-inscription"><span>希尔薇 <em>Sylvie</em></span><small>一卷画境 · 与你相逢</small></div><i class="unroll-spine"></i></div><svg class="unroll-cord" viewBox="0 0 1200 140" preserveAspectRatio="none"><path pathLength="1" d="M-40 92 C180 104 280 44 400 72 S650 138 810 72 S1050 26 1240 58"/></svg>';
    openingLayer=layer;frame.append(layer);document.body.classList.add('is-opening');
    const easing='cubic-bezier(.42,0,.16,1)';
    animatePart(layer.querySelector('path'),[{strokeDashoffset:1},{strokeDashoffset:0}],{duration:1050,easing:'cubic-bezier(.4,0,.4,1)',fill:'both'});
    const finish=animatePart(layer.querySelector('.unroll-paper'),[{transform:'translateX(0)'},{transform:'translateX(103%)'}],{duration:2000,delay:550,easing,fill:'both'});
    animatePart(layer.querySelector('.unroll-cord'),[{transform:'translateX(0)'},{transform:'translateX(108%)'}],{duration:1700,delay:1000,easing,fill:'both'});
    animatePart($('.cover-page .picture-header'),[{transform:'translateX(-24px)'},{transform:'translateX(0)'}],{duration:1700,easing,fill:'backwards'});
    animatePart($('.cover-page .picture-footer'),[{transform:'perspective(900px) rotateX(12deg) translateY(18px)'},{transform:'perspective(900px) rotateX(0deg) translateY(0)'}],{duration:1200,delay:1450,easing,fill:'backwards'});
    finish?.finished.then(()=>{if(request===openingRequest){layer.remove();openingLayer=null;document.body.classList.remove('is-opening');}},()=>{});
  }
  $('#replay').addEventListener('click',playOpening);
  goFable(readHash(),false);
  try{if(!sessionStorage.getItem('sylvie-fable-seen')&&readHash()===0)playOpening();sessionStorage.setItem('sylvie-fable-seen','1');}catch{}
  document.querySelectorAll('dialog .dialog-close').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();b.closest('dialog').close();}));

})();
