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
  const bookmark='<span class="ui-icon" data-icon="bookmark-simple" aria-hidden="true"></span>';
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
  const styleTerms=s=>String(s.style||'').split('/').map(x=>x.trim()).filter(Boolean);
  function matches(){
    const query=search.value.trim().normalize('NFKC').toLocaleLowerCase();
    const list=songs.filter(s=>!s.deletedAt&&(view!=='saved'||saved.has(String(s.id)))&&(view!=='recent'||recent.some(x=>x.id===String(s.id)))&&(view!=='new'||isNew(s))&&(!language||s.language===language)&&(!style||styleTerms(s).includes(style))&&(!query||`${s.name} ${s.singer} ${songNumber(s)}`.normalize('NFKC').toLocaleLowerCase().includes(query)));
    return list.sort((a,b)=>view==='recent'?recent.findIndex(x=>x.id===String(a.id))-recent.findIndex(x=>x.id===String(b.id)):Number(isNew(b))-Number(isNew(a))||(isNew(a)?b.createdAt-a.createdAt:(a.order??songs.indexOf(a))-(b.order??songs.indexOf(b))));
  }
  function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function showSlip(song){
    $('#feedback-text').textContent='点歌 '+song.name;feedback.dataset.long=String(song.name.length>30);feedback.hidden=false;
    clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>{feedback.hidden=true;},6200);
    feedback.getAnimations?.().forEach(a=>a.cancel());
    if(!reduced.matches&&!document.body.classList.contains('static-mode'))feedback.animate([{transform:'translate(-50%,6px)',opacity:0},{transform:'translate(-50%,0)',opacity:1}],{duration:200,easing:'ease-out'});
  }
  function recordChoice(song,notify=true){selected=String(song.id);recent=[{id:String(song.id),at:Date.now()},...recent.filter(x=>x.id!==String(song.id))].slice(0,30);saveViewer();const index=matches().findIndex(s=>String(s.id)===selected);if(index>=0)page=Math.floor(index/pageSize);render();if(notify)showSlip(song);else{feedback.hidden=true;clearTimeout(feedbackTimer);}const row=[...rows.children].find(r=>r.dataset.song===selected);row?.scrollIntoView({block:'nearest',behavior:reduced.matches||document.body.classList.contains('static-mode')?'instant':'smooth'});row?.querySelector('.select-song')?.focus({preventScroll:true});}
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
      if(clip){const preview=make('a','song-preview','看演唱 ');const icon=make('span','ui-icon');icon.dataset.icon='arrow-up-right';icon.setAttribute('aria-hidden','true');preview.append(icon);preview.href=clip.url;preview.target='_blank';preview.rel='noreferrer';names.append(preview);}
      const favorite=make('button','favorite');favorite.type='button';favorite.innerHTML=bookmark;
      favorite.setAttribute('aria-pressed',String(saved.has(id)));favorite.setAttribute('aria-label',(saved.has(id)?'取消收藏 ':'收藏 ')+song.name);
      favorite.addEventListener('click',()=>{saved.has(id)?saved.delete(id):saved.add(id);saveViewer();render();const target=[...rows.querySelectorAll('.track')].find(e=>e.dataset.song===id)?.querySelector('.favorite')||$('[data-view="'+view+'"]');target?.focus({preventScroll:true});});
      const select=make('button','select-song');select.type='button';select.setAttribute('aria-label',(selected===id?'已选，重新复制点歌 ':'复制点歌 ')+song.name);select.setAttribute('aria-pressed',String(selected===id));
      select.append(make('span','request-label',selected===id?'已选':'点歌'));select.addEventListener('click',()=>choose(song));
      row.append(number,names,favorite,select);rows.append(row);
    }
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  }
  function updateFilters(){
    document.querySelectorAll('[data-field]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.field==='language'?language:style)===b.dataset.value)));
    const count=[language,style].filter(Boolean).length;
    $('#filter-label').textContent=count?'筛选 · '+count:'筛选';
    const selection=$('#filter-selection');if(selection){selection.textContent=[language,style].filter(Boolean).join(' / ')||'全部语言与曲风';selection.dataset.active=String(!!count);}
  }
  function setupFilters(){
    for(const field of ['language','style']){
      const target=$('#'+field+'-choices');target.replaceChildren();
      for(const value of ['',...new Set(songs.filter(s=>!s.deletedAt).flatMap(s=>field==='style'?styleTerms(s):[s[field]]).filter(Boolean))]){
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
  function fitFilterPanel(){
    const details=$('.filter');if(!details.open)return;
    const pop=details.querySelector('.filter-pop'),tools=details.closest('.tools'),scroller=details.closest('[data-inner-scroll]');
    if(!scroller)return;
    const bounds=scroller.getBoundingClientRect(),anchor=tools.getBoundingClientRect();
    const below=bounds.bottom-anchor.bottom-20,above=anchor.top-bounds.top-20,up=below<210&&above>below;
    pop.style.top=up?'auto':'calc(100% + 9px)';pop.style.bottom=up?'calc(100% + 9px)':'auto';
    pop.style.maxHeight=Math.max(100,Math.min(560,up?above:below))+'px';
  }
  $('.filter').addEventListener('toggle',fitFilterPanel);
  window.addEventListener('resize',fitFilterPanel);
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
  fetch('submissions.json').then(r=>r.json()).then(data=>{media=data;if(songs.length)render();if(typeof renderFilmGallery==='function')renderFilmGallery(data);}).catch(()=>{});
  loadCatalog();
  function renderFilmGallery(clips){
    const section=document.querySelector('.submission-section'),grid=section?.querySelector('.submission-grid');
    if(!grid||!Array.isArray(clips))return;
    let genre='全部',filmPage=0,query='';const perPage=12;
    const categories=['全部','原创','翻唱','合唱','现场与片段','形象与纪念','趣味切片'];
    const toolbar=make('div','film-toolbar'),nav=make('nav','film-categories');nav.setAttribute('aria-label','声映集分类');
    const searchLabel=make('label','film-search'),input=make('input');input.type='search';input.placeholder='搜索作品或版本';input.setAttribute('aria-label','搜索声映集作品或版本');
    const searchIcon=make('span','ui-icon');searchIcon.dataset.icon='magnifying-glass';searchIcon.setAttribute('aria-hidden','true');searchLabel.append(searchIcon,input);
    toolbar.append(nav,searchLabel);grid.before(toolbar);
    const status=make('p','film-result');status.setAttribute('role','status');toolbar.after(status);
    const paging=make('nav','film-pagination');paging.setAttribute('aria-label','声映集分页');
    const prev=make('button','','上一页'),pageLabel=make('span','num'),next=make('button','','下一页');prev.type=next.type='button';paging.append(prev,pageLabel,next);grid.after(paging);
    for(const category of categories){const b=make('button','',category+' '+clips.filter(r=>category==='全部'||r.category===category).length);b.type='button';b.dataset.filmCategory=category;b.onclick=()=>{genre=category;filmPage=0;draw()};nav.append(b)}
    input.addEventListener('input',()=>{query=input.value.trim().normalize('NFKC').toLowerCase();filmPage=0;draw()});
    function icon(name){const e=make('span','ui-icon');e.dataset.icon=name;e.setAttribute('aria-hidden','true');return e}
    function draw(){
      const filtered=clips.filter(r=>(genre==='全部'||r.category===genre)&&[r.songName,r.title,r.version].join(' ').normalize('NFKC').toLowerCase().includes(query));
      const pages=Math.max(1,Math.ceil(filtered.length/perPage));filmPage=Math.min(filmPage,pages-1);grid.replaceChildren();
      nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filmCategory===genre)));
      status.textContent=`${filtered.length} 部作品${filtered.length?` · 第 ${filmPage*perPage+1}–${Math.min(filtered.length,(filmPage+1)*perPage)} 部`:''}`;
      if(!filtered.length)grid.append(make('p','film-empty','没有找到这部作品，试试歌名或其他分类。'));
      for(const r of filtered.slice(filmPage*perPage,(filmPage+1)*perPage)){
        const card=make('a','submission');card.href=r.url;card.target='_blank';card.rel='noreferrer';card.title=r.title;
        card.setAttribute('aria-label',`${r.songName}${r.version?'，'+r.version:''}，在 B 站观看`);
        const cover=make('div','submission-cover'),img=make('img');img.src=r.cover;img.width=640;img.height=360;img.loading='lazy';img.decoding='async';img.alt=r.songName+'投稿封面';
        const play=make('span','submission-play');play.append(icon('play'));play.setAttribute('aria-hidden','true');
        const duration=make('span','submission-duration num',r.durationText||`${Math.floor(r.duration/60)}:${String(r.duration%60).padStart(2,'0')}`);cover.append(img,play,duration);
        const meta=make('div','submission-meta');meta.append(make('span','',r.category),make('time','',r.date||''));
        const title=make('h3','',r.songName);title.append(icon('arrow-up-right'));
        card.append(cover,meta,title,make('p','',r.version||r.owner||'希尔薇Sylvie'));grid.append(card);
      }
      paging.hidden=pages<=1;prev.disabled=filmPage===0;next.disabled=filmPage===pages-1;pageLabel.textContent=`${filmPage+1} / ${pages}`;
    }
    function turn(amount){filmPage+=amount;draw();section.closest('[data-inner-scroll]')?.scrollTo({top:toolbar.offsetTop-24,behavior:'instant'});(amount>0?(next.disabled?prev:next):(prev.disabled?next:prev)).focus({preventScroll:true})}
    prev.onclick=()=>turn(-1);next.onclick=()=>turn(1);draw();
  }
  const theme='fable',horizontal=false;
  const rail=$('#fable-rail'),panels=[...document.querySelectorAll('[data-page]')];
  let currentPage=0,scrollFrame=0,wheelSum=0,lastWheel=0,wheelLock=0,quietPreference=false,resizeTimer;
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
    clearTimeout(resizeTimer);
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
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>goFable(currentPage,false),100);},{passive:true});
  window.addEventListener('hashchange',()=>goFable(readHash()));
  $('#motion-toggle').addEventListener('click',()=>{quietPreference=!quietPreference;try{localStorage.setItem('sylvie-reduced-motion',String(quietPreference));}catch{}applyMotionPreference();});
  reduced.addEventListener('change',applyMotionPreference);applyMotionPreference();
  async function playOpening(){
    stopOpening();goFable(0,false);
    if(quiet())return;
    const request=openingRequest,frame=$('.cover-page .picture-window');
    // One attached cover and rolled edge share one timeline; the artwork and surrounding type stay still.
    const layer=document.createElement('div');layer.className='unroll-layer';layer.setAttribute('aria-hidden','true');
    layer.innerHTML='<div class="unroll-paper"><div class="unroll-inscription"><span>初见</span><small>与君相逢 · 听此一曲</small></div><i class="unroll-spine"></i></div>';
    openingLayer=layer;frame.append(layer);document.body.classList.add('is-opening');
    await Promise.race([preparePicture(0),new Promise(resolve=>setTimeout(resolve,3500))]);
    if(request!==openingRequest||quiet())return;
    const finish=animatePart(layer.querySelector('.unroll-paper'),[{transform:'translateX(0)'},{transform:'translateX(102%)'}],{duration:2400,delay:350,easing:'cubic-bezier(.42,0,.28,1)',fill:'both'});
    finish?.finished.then(()=>{if(request===openingRequest){layer.remove();openingLayer=null;document.body.classList.remove('is-opening');}},()=>{});
  }
  $('#replay').addEventListener('click',playOpening);
  goFable(readHash(),false);
  try{if(!sessionStorage.getItem('sylvie-fable-seen')&&readHash()===0)playOpening();sessionStorage.setItem('sylvie-fable-seen','1');}catch{}
  document.querySelectorAll('dialog .dialog-close').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();b.closest('dialog').close();}));

})();
