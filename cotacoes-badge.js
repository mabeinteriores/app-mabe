(async function(){
 if(['127.0.0.1','localhost'].includes(location.hostname))return;
 for(let i=0;i<120&&!window.__camberProfile;i++)await new Promise(r=>setTimeout(r,250));
 const p=window.__camberProfile,allowed=p?.ativo&&p?.aprovado&&(p.papel==='admin'||p.abas_permitidas?.includes('projetos'));
 const a=document.querySelector('.nav a[href="cotacoes.html"]'),b=document.querySelector('.nav a[href="compras.html"]');if(!allowed){if(a)a.hidden=true;if(b)b.hidden=true;return}
 try{if(!window.CamberQuotes)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='cotacoes-shared.js?v=uuid1';s.onload=resolve;s.onerror=reject;document.head.append(s)});const summary=await CamberQuotes.api('dashboard',{summaryOnly:true}),n=summary.kpis.attention;if(a&&n){const badge=document.createElement('span');badge.className='cq-nav-badge';badge.textContent=n;badge.style.cssText='position:absolute;top:0;right:0;background:#ac423b;color:white;border-radius:10px;padding:1px 5px;font-size:10px';a.append(badge);a.setAttribute('aria-label','Cotações: '+n+' precisam de atenção')}}catch(e){console.info('Contador de cotações indisponível:',e.message)}
})();
