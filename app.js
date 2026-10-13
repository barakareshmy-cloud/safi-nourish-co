'use strict';
const storageKey='safi-nourish-preview-cart-v1';
let cart=[];
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))cart=saved.filter(i=>i&&['beef','sheep'].includes(i.kind)&&['glass','plastic'].includes(i.pack)&&[500,1000].includes(i.size)&&Number.isInteger(i.qty)&&i.qty>0&&i.qty<1000)}catch(_){cart=[]}
const priceList={'beef-glass-500':450,'beef-glass-1000':850,'beef-plastic-500':350,'beef-plastic-1000':750,'sheep-glass-500':600,'sheep-glass-1000':1150,'sheep-plastic-500':500,'sheep-plastic-1000':950};
const money=n=>'KSh '+n.toLocaleString('en-KE');
const formatItem=i=>`${i.kind==='beef'?'Beef':'Sheep'} Tallow · ${i.size===1000?'1 kg':'500 g'} · ${i.pack==='glass'?'Glass':'Plastic'}`;
const price=i=>priceList[`${i.kind}-${i.pack}-${i.size}`]||0;
const subtotal=()=>cart.reduce((s,i)=>s+price(i)*i.qty,0);
const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(cart))}catch(_){}};
function whatsappUrl(){if(!cart.length)return 'https://wa.me/254740450447';const lines=cart.map(i=>`• ${formatItem(i)} × ${i.qty} — ${money(price(i)*i.qty)}`);const msg=`Hello Safi Nourish Co.! I would like to order:\n\n${lines.join('\n')}\n\nSubtotal: ${money(subtotal())}${deliveryDetails()}\nPlease confirm availability, delivery fees and payment instructions.`;return 'https://wa.me/254740450447?text='+encodeURIComponent(msg)}
const get=id=>document.getElementById(id);
function deliveryDetails(){const customer=(get('delivery-name')?.value||'').trim(),phone=(get('delivery-phone')?.value||'').trim(),area=(get('delivery-area')?.value||'').trim(),street=(get('delivery-address')?.value||'').trim(),pin=(get('delivery-pin')?.value||'').trim();return '\n\nDelivery details:'+(customer?'\nName: '+customer:'')+(phone?'\nPhone: '+phone:'')+(area?'\nTown / area: '+area:'')+(street?'\nStreet / landmark: '+street:'')+(pin?'\nGoogle Maps pin: '+pin:'')}
function setOrderLinks(){const url=whatsappUrl();get('order-whatsapp').href=url;get('checkout-whatsapp').href=url}

const shade=get('drawer-shade'),drawer=get('cart-drawer');
let toastTimer;
function notify(message){const el=get('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function renderCart(){const n=cart.reduce((s,i)=>s+i.qty,0);get('cart-count').textContent=n;get('drawer-count').textContent=`(${n})`;get('subtotal').textContent=money(subtotal());get('checkout-total').textContent=`Subtotal: ${money(subtotal())}`;const url=whatsappUrl();get('order-whatsapp').href=url;get('checkout-whatsapp').href=url;get('open-checkout').disabled=!cart.length;get('order-whatsapp').setAttribute('aria-disabled',!cart.length?'true':'false');const list=get('cart-items');list.replaceChildren();if(!cart.length){const p=document.createElement('p');p.className='empty-cart';p.textContent='Your shopping bag is empty. Explore our tallow collection and add something you love.';list.append(p);return}for(const item of cart){const row=document.createElement('div');row.className='cart-line';const details=document.createElement('div');const title=document.createElement('strong');title.textContent=item.kind==='beef'?'Safi Beef Tallow':'Safi Sheep Tallow';const sub=document.createElement('small');sub.textContent=`${item.size===1000?'1 kg':'500 g'} · ${item.pack} · Qty ${item.qty}`;const remove=document.createElement('button');remove.type='button';remove.textContent='Remove item';remove.addEventListener('click',()=>{cart=cart.filter(i=>!(i.kind===item.kind&&i.pack===item.pack&&i.size===item.size));persist();renderCart()});details.append(title,sub,remove);const total=document.createElement('b');total.textContent=money(price(item)*item.qty);row.append(details,total);list.append(row)}}
function openCart(){shade.hidden=false;drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';get('close-cart').focus()}
function closeCart(){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');shade.hidden=true;document.body.style.overflow=''}
get('open-cart').addEventListener('click',openCart);get('close-cart').addEventListener('click',closeCart);shade.addEventListener('click',closeCart);
document.querySelectorAll('.product-card').forEach(card=>{card.querySelector('.add-btn').addEventListener('click',()=>{const kind=card.dataset.kind,pack=card.dataset.pack,size=Number(card.querySelector('select').value);const found=cart.find(i=>i.kind===kind&&i.pack===pack&&i.size===size);if(found)found.qty++;else cart.push({kind,pack,size,qty:1});persist();renderCart();notify('Added to your shopping bag');openCart()})});
get('open-checkout').addEventListener('click',()=>{if(!cart.length)return;closeCart();get('checkout-dialog').showModal()});
get('checkout-dialog').addEventListener('close',()=>document.body.style.overflow='');
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drawer.classList.contains('open'))closeCart()});
get('year').textContent=new Date().getFullYear();
get('menu-toggle').addEventListener('click',()=>{const nav=get('navigation');const open=nav.classList.toggle('open');get('menu-toggle').setAttribute('aria-expanded',String(open))});
document.querySelectorAll('#navigation a').forEach(a=>a.addEventListener('click',()=>{get('navigation').classList.remove('open');get('menu-toggle').setAttribute('aria-expanded','false')}));
renderCart();

// Gallery filter controls, if the gallery is present.
const galleryButtons=document.querySelectorAll('[data-filter]');
const galleryCards=document.querySelectorAll('.safi-gallery-card');
if(galleryButtons.length){const applyGalleryFilter=key=>{let visible=0;galleryCards.forEach(card=>{const show=key==='all'||card.dataset.category===key;card.hidden=!show;if(show)visible++});galleryButtons.forEach(button=>{const selected=button.dataset.filter===key;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});const counter=document.getElementById('gallery-count');if(counter)counter.textContent=`Showing ${visible} photos`};galleryButtons.forEach(button=>button.addEventListener('click',()=>applyGalleryFilter(button.dataset.filter)));applyGalleryFilter('all')}

// Delivery location: customers enter an address and optionally a Google Maps pin.
['delivery-name','delivery-phone','delivery-area','delivery-address','delivery-pin'].forEach(id=>get(id)?.addEventListener('input',setOrderLinks));
get('use-gps')?.addEventListener('click',()=>{const message=get('location-status');if(!navigator.geolocation){message.textContent='GPS is unavailable here; paste a Google Maps pin instead.';return}message.textContent='Requesting location permission…';navigator.geolocation.getCurrentPosition(pos=>{const {latitude,longitude}=pos.coords;get('delivery-pin').value=`https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;setOrderLinks();message.textContent='Location added. Please verify the pin before ordering.'},()=>{message.textContent='Location was not available. You can paste a Maps link instead.'},{enableHighAccuracy:true,timeout:15000,maximumAge:0})});
get('checkout-whatsapp')?.addEventListener('click',event=>{if(!cart.length){event.preventDefault();notify('Add a product to your bag first');return}const area=get('delivery-area').value.trim(),address=get('delivery-address').value.trim(),pin=get('delivery-pin').value.trim();if(!area||(!address&&!pin)){event.preventDefault();notify('Enter your delivery area and a street/landmark or Maps pin first');get(!area?'delivery-area':'delivery-address').focus()}});

// Constrained gallery viewer. Avoids opening raw images in full-screen browser tabs.
(() => {
 const dialog=document.getElementById('safi-photo-dialog');
 if(!dialog)return;
 const img=document.getElementById('safi-photo-img');
 const cap=document.getElementById('safi-photo-caption');
 document.querySelectorAll('a.gallery-zoom').forEach(link=>link.addEventListener('click',ev=>{
  ev.preventDefault();
  img.src=link.getAttribute('href');
  img.alt=link.querySelector('img')?.alt||'Safi Nourish photo';
  cap.textContent=link.closest('figure')?.querySelector('figcaption')?.textContent||img.alt;
  if(!dialog.open)dialog.showModal();
 }));
 document.getElementById('safi-photo-close')?.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{img.removeAttribute('src')});
})();
