/* Vagon Bakım ve Takip Sistemi - Mobil (PWA)
   Orijinal Masaüstü programının (Python/CustomTkinter) birebir mobil uyarlaması. */
"use strict";

/* ---------- Veri katmani (localStorage) ---------- */
const DB = {
  load() {
    const raw = localStorage.getItem("vagon_db_v1");
    if (raw) { try { return JSON.parse(raw); } catch (e) {} }
    // Ilk acilis: masaustu programindan tasinan veriler
    const seed = JSON.parse(JSON.stringify(SEED_DATA));
    localStorage.setItem("vagon_db_v1", JSON.stringify(seed));
    return seed;
  },
  save(d) { localStorage.setItem("vagon_db_v1", JSON.stringify(d)); },
  reset() { localStorage.removeItem("vagon_db_v1"); }
};
let db = DB.load();

function nextId(arr) { return arr.length ? Math.max(...arr.map(r => r.id)) + 1 : 1; }

/* ---------- Tarih yardimcilari (orijinaldeki %d.%m.%Y formati) ---------- */
const AYLAR_TR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const pad = n => String(n).padStart(2, "0");
const bugun = () => { const d = new Date(); return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`; };

function tarihParse(s) {
  if (!s) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[2]-1, +m[1]);
  return isNaN(d.getTime()) ? null : d;
}
function tarihFmt(d) { return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`; }
function iso2tr(iso) { // <input type=date> degerini gg.aa.yyyy yap
  if (!iso) return "";
  const [y, m, g] = iso.split("-");
  return `${g}.${m}.${y}`;
}
function tr2iso(s) { // gg.aa.yyyy -> yyyy-mm-dd (input type=date icin)
  if (!s) return "";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/* Orijinal sure_hesapla: giris -> bitis (yoksa bugun) gun sayisi */
function sureHesapla(giris, bitis) {
  const g = tarihParse(giris); if (!g) return "";
  const b = tarihParse(bitis) || new Date();
  const gun = Math.round((b - g) / 86400000);
  if (gun === 0) return "Aynı Gün";
  return gun + " gün";
}
/* Parca bekleme suresi: gonderilme -> gelme (yoksa bugun) */
function beklemeHesapla(gonderilme, gelme) {
  const g = tarihParse(gonderilme); if (!g) return "";
  const c = tarihParse(gelme) || new Date();
  const gun = Math.round((c - g) / 86400000);
  if (gun === 0) return "Aynı Gün";
  return gun + " gün";
}

/* ---------- UI yardimcilari ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let toastTimer;
function toast(msg, warn) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (warn ? " warn" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = "toast", 2200);
}

function badge(durum) {
  const cls = durum === "Tamamlandı" ? "b-done" : durum === "Bakım devam ediyor" ? "b-devam" : "b-bekliyor";
  return `<span class="badge ${cls}">${esc(durum)}</span>`;
}

/* ---------- Sekme gecisi ---------- */
let aktifSayfa = "vagon";
document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", () => sayfaGoster(btn.dataset.page));
});
function sayfaGoster(sayfa) {
  aktifSayfa = sayfa;
  ["vagon","parca","demirbas","rapor"].forEach(p => $("page-"+p).classList.toggle("hidden", p !== sayfa));
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b.dataset.page === sayfa));
  $("fab").classList.toggle("hidden", sayfa === "rapor");
  if (sayfa === "rapor") raporGoster2();
  window.scrollTo(0, 0);
}

/* ---------- MODAL ---------- */
function modalAc(html) {
  $("sheet").innerHTML = `<div class="grab"></div>` + html;
  $("overlay").classList.add("open");
}
function modalKapat() { $("overlay").classList.remove("open"); }
$("overlay").addEventListener("click", e => { if (e.target === $("overlay")) modalKapat(); });


/* ---------- VAGON SAYFASI ---------- */
function vagonFiltrele() {
  const q = $("f-vagon").value.trim().toLowerCase();
  const ay = $("f-ay").value;
  return db.vagonlar.filter(v => {
    if (q && !v.vagon_no.toLowerCase().includes(q)) return false;
    if (ay === "devam" && v.durum === "Tamamlandı") return false;
    if (/^\d{4}-\d{2}$/.test(ay)) { // yil-ay filtresi
      const b = tarihParse(v.bitis_tarihi);
      if (!b) return false;
      const [y, m] = ay.split("-").map(Number);
      if (b.getFullYear() !== y || b.getMonth() + 1 !== m) return false;
    }
    return true;
  });
}

/* Tum Liste modu: arama yapilmadan gecmis kayitlari gorme bayragi */
let tumListeAcik = false;

function vagonListele() {
  const q = $("f-vagon").value.trim();
  const ay = $("f-ay").value;
  const el = $("vagon-list");
  /* Arama-öncelikli akış: sorgu/filtre yoksa liste açılmaz, arama ekranı gösterilir */
  if (!q && ay === "all" && !tumListeAcik) {
    const toplam = db.vagonlar.length;
    const devam = db.vagonlar.filter(r => r.durum !== "Tamamlandı").length;
    $("vagon-count").innerHTML = `Toplam vagon sayısı: <b>${toplam}</b>`;
    $("vagon-info").textContent = devam ? `${devam} devam ediyor` : "";
    el.innerHTML = `
      <div class="hero">
        <div class="hero-ic">🔍</div>
        <h3>Vagon Arama</h3>
        <p>Yukarıdaki arama kutusuna <b>vagon numarası</b> yazın.<br>Sonuçlar burada listelenecek.</p>
        <div class="hero-actions">
          <button class="btn btn-s" id="hero-devam">🟠 Devam edenler (${devam})</button>
          <button class="btn btn-s" id="hero-tumliste">📋 Tüm Liste (${toplam})</button>
        </div>
      </div>`;
    const hd = $("hero-devam");
    if (hd) hd.addEventListener("click", () => { $("f-ay").value = "devam"; vagonListele(); });
    const ht = $("hero-tumliste");
    if (ht) ht.addEventListener("click", () => { tumListeAcik = true; vagonListele(); });
    return;
  }
  const rows = vagonFiltrele();
  $("vagon-count").innerHTML = tumListeAcik && !q && ay === "all"
    ? `Tüm kayıtlar: <b>${rows.length}</b>`
    : `Sonuç sayısı: <b>${rows.length}</b>`;
  const devam = rows.filter(r => r.durum !== "Tamamlandı").length;
  $("vagon-info").textContent = devam ? `${devam} devam ediyor` : "";
  if (!rows.length) { el.innerHTML = `<div class="empty">Kayıt bulunamadı.</div>`; return; }
  el.innerHTML = rows.map(v => `
    <div class="vcard" data-id="${v.id}">
      <div class="vno">${esc(v.vagon_no)}</div>
      <div class="vrow">
        <span class="cell">Giriş: <b>${esc(v.giris_tarihi || "-")}</b></span>
        <span class="cell">Bitiş: <b>${esc(v.bitis_tarihi || "-")}</b></span>
        <span class="cell">Süre: <b class="sure">${sureHesapla(v.giris_tarihi, v.bitis_tarihi)}</b></span>
      </div>
      <div class="vrow"><span>${badge(v.durum || "")}</span></div>
    </div>`).join("");
  if (tumListeAcik && !q && ay === "all") {
    el.insertAdjacentHTML("afterbegin", `<button class="btn btn-s btn-geri" id="geri-arama">← Arama ekranına dön</button>`);
    const gg = $("geri-arama");
    if (gg) gg.addEventListener("click", () => { tumListeAcik = false; vagonListele(); });
  }
  el.querySelectorAll(".vcard").forEach(c => c.addEventListener("click", () => vagonDetay(+c.dataset.id)));
}

$("f-vagon").addEventListener("input", () => { if ($("f-vagon").value.trim()) tumListeAcik = false; vagonListele(); });
$("f-ay").addEventListener("change", vagonListele);

/* Ay filtresi secenekleri (orijinaldeki gibi bitis tarihlerinden) */
function secenekleriDoldur() {
  const sel = $("f-ay");
  const simdiki = sel.value;
  const yillar = new Set();
  db.vagonlar.forEach(v => { const d = tarihParse(v.bitis_tarihi); if (d) yillar.add(d.getFullYear()); });
  let html = `<option value="all">Tüm Zamanlar</option><option value="devam">Devam Edenler</option>`;
  [...yillar].sort().reverse().forEach(y => {
    AYLAR_TR.forEach((a, i) => { html += `<option value="${y}-${pad(i+1)}">${a} ${y}</option>`; });
  });
  sel.innerHTML = html;
  if ([...sel.options].some(o => o.value === simdiki)) sel.value = simdiki;
}

/* Vagon detay karti (orijinal vagon_detay_goster) */
function vagonDetay(id) {
  const v = db.vagonlar.find(r => r.id === id); if (!v) return;
  modalAc(`
    <h3>Vagon Detay Kartı</h3>
    <div class="det">
      <dl>
        <dt>VAGON NO</dt><dd style="color:#5b9bd5;font-weight:700">${esc(v.vagon_no)}</dd>
        <dt>Atölye Giriş</dt><dd>${esc(v.giris_tarihi || "-")}</dd>
        <dt>Kanala Alınma</dt><dd>${esc(v.kanal_tarihi || "-")}</dd>
        <dt>İş Bitiş</dt><dd>${esc(v.bitis_tarihi || "-")}</dd>
        <dt>Bekleme Süresi</dt><dd class="sure">${sureHesapla(v.giris_tarihi, v.bitis_tarihi)}</dd>
        <dt>Durum</dt><dd>${badge(v.durum || "")}</dd>
      </dl>
      <div class="aciklama">${v.aciklama ? esc(v.aciklama) : "Açıklama girilmemiş."}</div>
      <div class="actions">
        <button class="btn btn-s" onclick="vagonSil(${v.id})">🗑 Sil</button>
        <button class="btn btn-p" onclick="vagonForm(${v.id})">✏ Güncelle</button>
      </div>
      <div class="actions"><button class="btn btn-s" onclick="modalKapat()">Kapat</button></div>
    </div>`);
}

/* Vagon silme onayi */
function vagonSil(id) {
  const v = db.vagonlar.find(r => r.id === id);
  modalAc(`
    <h3>Silme Onayı</h3>
    <p style="margin-top:8px;font-size:.88rem">${esc(v.vagon_no)} — seçili vagonu veritabanından silmek istiyor musunuz?</p>
    <div class="actions">
      <button class="btn btn-s" onclick="vagonDetay(${id})">Vazgeç</button>
      <button class="btn btn-r" onclick="vagonSilOnay(${id})">🗑 Sil</button>
    </div>`);
}
function vagonSilOnay(id) {
  db.vagonlar = db.vagonlar.filter(r => r.id !== id);
  DB.save(db);
  modalKapat();
  secenekleriDoldur();
  vagonListele();
  toast("Vagon silindi.");
}

/* Vagon formu (orijinal vagon_form_ac: ekleme + guncelleme) */
function vagonForm(id) {
  const v = id ? db.vagonlar.find(r => r.id === id) : null;
  modalAc(`
    <h3>${v ? "Vagon Güncelle" : "Yeni Vagon Kaydı"}</h3>
    <label>Vagon Numarası *</label>
    <input id="vf-no" value="${esc(v ? v.vagon_no : "")}" placeholder="örn: 3175 4569 724-3">
    <div class="row2">
      <div><label>Atölye Giriş Tarihi *</label>
        <input type="date" id="vf-giris" value="${tr2iso(v ? v.giris_tarihi : bugun())}"></div>
      <div><label>Kanala Alınma Tarihi</label>
        <input type="date" id="vf-kanal" value="${tr2iso(v ? v.kanal_tarihi : "")}"></div>
    </div>
    <div class="row2">
      <div><label>Bitiş Tarihi</label>
        <input type="date" id="vf-bitis" value="${tr2iso(v ? v.bitis_tarihi : "")}"></div>
      <div><label>Durum</label>
        <select id="vf-durum">
          <option ${v && v.durum === "Bakım devam ediyor" ? "selected" : ""}>Bakım devam ediyor</option>
          <option ${!v || v.durum === "Parça bekliyor" ? "selected" : ""}>Parça bekliyor</option>
          <option ${v && v.durum === "Tamamlandı" ? "selected" : ""}>Tamamlandı</option>
        </select></div>
    </div>
    <label>Açıklama</label>
    <textarea id="vf-aciklama" rows="5">${esc(v ? v.aciklama : "")}</textarea>
    <div class="err" id="vf-err"></div>
    <div class="actions">
      <button class="btn btn-s" onclick="${id ? `vagonDetay(${id})` : "modalKapat()"}">Vazgeç</button>
      <button class="btn btn-p" onclick="vagonKaydet(${id || 0})">💾 Kaydet</button>
    </div>`);
  // Durum "Tamamlandı" secilince bitis tarihi otomatik bugun (orijinal davranis)
  const dsel = $("vf-durum"), bts = $("vf-bitis");
  dsel.addEventListener("change", () => {
    if (dsel.value === "Tamamlandı" && !bts.value) bts.value = tr2iso(bugun());
  });
}

function vagonKaydet(id) {
  const no = $("vf-no").value.trim();
  const err = $("vf-err"); err.textContent = "";
  if (!no) { err.textContent = "Vagon No zorunludur!"; return; }
  const giris = iso2tr($("vf-giris").value);
  const kanal = iso2tr($("vf-kanal").value);
  const bitis = iso2tr($("vf-bitis").value);
  const durum = $("vf-durum").value;
  const aciklama = $("vf-aciklama").value.trim();
  if (!giris) { err.textContent = "Giriş tarihi zorunludur!"; return; }
  const kayit = { vagon_no: no, giris_tarihi: giris, kanal_tarihi: kanal, bitis_tarihi: bitis, durum, aciklama };
  if (id) {
    Object.assign(db.vagonlar.find(r => r.id === id), kayit);
  } else {
    const varmi = db.vagonlar.some(r => r.vagon_no.toLowerCase() === no.toLowerCase());
    if (varmi && !confirm("Bu vagon zaten sistemde var!\nYine de yeni kayıt açılsın mı?")) return;
    kayit.id = nextId(db.vagonlar);
    db.vagonlar.push(kayit);
  }
  DB.save(db);
  modalKapat();
  secenekleriDoldur();
  vagonListele();
  toast(id ? "Vagon güncellendi." : "Yeni vagon eklendi.");
}

/* ---------- PARCA SAYFASI ---------- */
function parcaListele() {
  const q = $("f-parca").value.trim().toLowerCase();
  const rows = db.parca_takip.filter(p => !q || (p.vagon_no || "").toLowerCase().includes(q));
  $("parca-count").innerHTML = `Toplam parça kaydı: <b>${rows.length}</b>`;
  const el = $("parca-list");
  if (!rows.length) { el.innerHTML = `<div class="empty">Kayıt bulunamadı.</div>`; return; }
  el.innerHTML = rows.map(p => `
    <div class="vcard pcard" data-id="${p.id}">
      <div><span class="ptip">${esc(p.parca_tipi || "-")}</span> <span class="pmarka">${esc(p.urun_markasi || "")}</span></div>
      <div class="vrow">
        <span class="cell">Vagon: <b>${esc(p.vagon_no || "-")}</b></span>
        <span class="cell">Adet: <b>${esc(p.adet || "-")}</b></span>
        <span class="cell">Seri: <b>${esc(p.seri_no || "-")}</b></span>
      </div>
      <div class="vrow">
        <span class="cell">Sökülme: <b>${esc(p.sokulme_tarihi || "-")}</b></span>
        <span class="cell">Gönderilme: <b>${esc(p.gonderilme_tarihi || "-")}</b></span>
        <span class="cell">Gelme: <b>${esc(p.gelme_tarihi || "-")}</b></span>
      </div>
      <div class="vrow">
        ${p.gonderilme_tarihi ? `<span class="cell">Bekleme: <b class="wait">${beklemeHesapla(p.gonderilme_tarihi, p.gelme_tarihi)}</b></span>` : ""}
        ${p.gelme_tarihi ? `<span class="badge b-done">GELDİ</span>` : `<span class="badge b-bekliyor">YOLDA</span>`}
      </div>
      <div class="vrow"><span class="cell">${esc((p.ariza_nedeni || "").slice(0, 90))}${(p.ariza_nedeni || "").length > 90 ? "…" : ""}</span></div>
    </div>`).join("");
  el.querySelectorAll(".pcard").forEach(c => c.addEventListener("click", () => parcaDetay(+c.dataset.id)));
}
$("f-parca").addEventListener("input", parcaListele);

/* Parca detay karti (orijinal p_detay_ac) */
function parcaDetay(id) {
  const p = db.parca_takip.find(r => r.id === id); if (!p) return;
  modalAc(`
    <h3>Parça Detay Kartı</h3>
    <div class="det">
      <dl>
        <dt>Parça</dt><dd style="color:#5b9bd5;font-weight:700">${esc(p.parca_tipi || "-")} ${esc(p.urun_markasi || "")}</dd>
        <dt>Seri No</dt><dd>${esc(p.seri_no || "-")}</dd>
        <dt>Adet</dt><dd>${esc(p.adet || "-")}</dd>
        <dt>Vagon</dt><dd>${esc(p.vagon_no || "-")}</dd>
        <dt>Sökülme</dt><dd>${esc(p.sokulme_tarihi || "-")}</dd>
        <dt>Gönderilme</dt><dd>${esc(p.gonderilme_tarihi || "-")}</dd>
        <dt>Gelme</dt><dd>${esc(p.gelme_tarihi || "-")}</dd>
        <dt>Bekleme</dt><dd class="wait">${p.gonderilme_tarihi ? beklemeHesapla(p.gonderilme_tarihi, p.gelme_tarihi) : "-"}</dd>
      </dl>
      <div class="aciklama">${p.ariza_nedeni ? esc(p.ariza_nedeni) : "Açıklama girilmemiş."}</div>
      <div class="actions">
        <button class="btn btn-s" onclick="parcaSil(${p.id})">🗑 Sil</button>
        <button class="btn btn-p" onclick="parcaForm(${p.id})">✏ Güncelle</button>
      </div>
      <div class="actions"><button class="btn btn-s" onclick="modalKapat()">Kapat</button></div>
    </div>`);
}

function parcaSil(id) {
  modalAc(`
    <h3>Silme Onayı</h3>
    <p style="margin-top:8px;font-size:.88rem">Seçili parçayı silmek istiyor musunuz?</p>
    <div class="actions">
      <button class="btn btn-s" onclick="parcaDetay(${id})">Vazgeç</button>
      <button class="btn btn-r" onclick="parcaSilOnay(${id})">🗑 Sil</button>
    </div>`);
}
function parcaSilOnay(id) {
  db.parca_takip = db.parca_takip.filter(r => r.id !== id);
  DB.save(db);
  modalKapat();
  parcaListele();
  toast("Parça kaydı silindi.");
}

/* Parca formu (orijinal parca_form_ac) */
function parcaForm(id) {
  const p = id ? db.parca_takip.find(r => r.id === id) : null;
  const tipler = [...new Set([
    ...db.parca_takip.map(x => x.parca_tipi), ...db.demirbaslar.map(x => x.parca_tipi)
  ].filter(Boolean))];
  modalAc(`
    <h3>${p ? "Parça Güncelle" : "Yeni Parça Kaydı"}</h3>
    <div class="row2">
      <div><label>Parça Tipi *</label>
        <input id="pf-tip" list="pf-tip-list" value="${esc(p ? p.parca_tipi : "")}" placeholder="örn: Yük Sensörü">
        <datalist id="pf-tip-list">${tipler.map(t => `<option value="${esc(t)}">`).join("")}</datalist></div>
      <div><label>Ürün Markası *</label>
        <input id="pf-marka" value="${esc(p ? p.urun_markasi : "")}" placeholder="örn: KNOR"></div>
    </div>
    <div class="row2">
      <div><label>Adet</label><input id="pf-adet" inputmode="numeric" value="${esc(p ? p.adet : "1")}"></div>
      <div><label>Seri Numarası</label><input id="pf-seri" value="${esc(p ? p.seri_no : "")}"></div>
    </div>
    <label>Vagon Numarası</label>
    <input id="pf-vagon" list="pf-vagon-list" value="${esc(p ? p.vagon_no : "")}" placeholder="3175 ...">
    <datalist id="pf-vagon-list">${db.vagonlar.map(v => `<option value="${esc(v.vagon_no)}">`).join("")}</datalist>
    <div class="row2">
      <div><label>Sökülme Tarihi</label><input type="date" id="pf-sokulme" value="${tr2iso(p ? p.sokulme_tarihi : "")}"></div>
      <div><label>Gönderilme Tarihi</label><input type="date" id="pf-gonder" value="${tr2iso(p ? p.gonderilme_tarihi : "")}"></div>
    </div>
    <label>Gelme Tarihi</label>
    <input type="date" id="pf-gelme" value="${tr2iso(p ? p.gelme_tarihi : "")}">
    <label>Arıza Nedeni</label>
    <textarea id="pf-ariza" rows="4">${esc(p ? p.ariza_nedeni : "")}</textarea>
    <div class="err" id="pf-err"></div>
    <div class="actions">
      <button class="btn btn-s" onclick="${id ? `parcaDetay(${id})` : "modalKapat()"}">Vazgeç</button>
      <button class="btn btn-p" onclick="parcaKaydet(${id || 0})">💾 Kaydet</button>
    </div>`);
}

function parcaKaydet(id) {
  const tip = $("pf-tip").value.trim();
  const marka = $("pf-marka").value.trim();
  const err = $("pf-err"); err.textContent = "";
  if (!tip && !marka) { err.textContent = "Parça Tipi veya Marka zorunludur!"; return; }
  const kayit = {
    parca_tipi: tip, urun_markasi: marka, adet: $("pf-adet").value.trim(),
    seri_no: $("pf-seri").value.trim(), vagon_no: $("pf-vagon").value.trim(),
    sokulme_tarihi: iso2tr($("pf-sokulme").value), gonderilme_tarihi: iso2tr($("pf-gonder").value),
    gelme_tarihi: iso2tr($("pf-gelme").value), ariza_nedeni: $("pf-ariza").value.trim()
  };
  if (id) Object.assign(db.parca_takip.find(r => r.id === id), kayit);
  else { kayit.id = nextId(db.parca_takip); db.parca_takip.push(kayit); }
  DB.save(db);
  modalKapat();
  parcaListele();
  toast(id ? "Parça güncellendi." : "Yeni parça eklendi.");
}

/* ---------- DEMIRBAS SAYFASI ---------- */
function demirbasListele() {
  const rows = [...db.demirbaslar].sort((a, b) => (a.parca_tipi || "").localeCompare(b.parca_tipi || "", "tr"));
  $("demirbas-count").innerHTML = `Toplam demirbaş: <b>${rows.length}</b>`;
  const el = $("demirbas-list");
  if (!rows.length) { el.innerHTML = `<div class="empty">Kayıt bulunamadı.</div>`; return; }
  el.innerHTML = rows.map(d => `
    <div class="vcard" data-id="${d.id}">
      <div><span class="ptip">${esc(d.parca_tipi || "-")}</span> <span class="pmarka">${esc(d.urun_markasi || "")}</span></div>
      <div class="vrow">
        <span class="cell">Seri: <b>${esc(d.seri_no || "-")}</b></span>
        <span class="cell">Adet: <b>${esc(d.adet || "-")}</b></span>
      </div>
    </div>`).join("");
  el.querySelectorAll(".vcard").forEach(c => c.addEventListener("click", () => demirbasDetay(+c.dataset.id)));
}

function demirbasDetay(id) {
  const d = db.demirbaslar.find(r => r.id === id); if (!d) return;
  modalAc(`
    <h3>Demirbaş Detayı</h3>
    <div class="det">
      <dl>
        <dt>Parça Tipi</dt><dd style="color:#5b9bd5;font-weight:700">${esc(d.parca_tipi || "-")}</dd>
        <dt>Ürün Markası</dt><dd>${esc(d.urun_markasi || "-")}</dd>
        <dt>Seri Numarası</dt><dd>${esc(d.seri_no || "-")}</dd>
        <dt>Adet</dt><dd>${esc(d.adet || "-")}</dd>
      </dl>
      <div class="actions">
        <button class="btn btn-s" onclick="demirbasSil(${d.id})">🗑 Sil</button>
        <button class="btn btn-p" onclick="demirbasForm(${d.id})">✏ Güncelle</button>
      </div>
      <div class="actions"><button class="btn btn-s" onclick="modalKapat()">Kapat</button></div>
    </div>`);
}

function demirbasSil(id) {
  modalAc(`
    <h3>Silme Onayı</h3>
    <p style="margin-top:8px;font-size:.88rem">Demirbaş kaydı silinsin mi?</p>
    <div class="actions">
      <button class="btn btn-s" onclick="demirbasDetay(${id})">Vazgeç</button>
      <button class="btn btn-r" onclick="demirbasSilOnay(${id})">🗑 Sil</button>
    </div>`);
}
function demirbasSilOnay(id) {
  db.demirbaslar = db.demirbaslar.filter(r => r.id !== id);
  DB.save(db);
  modalKapat();
  demirbasListele();
  toast("Demirbaş silindi.");
}

function demirbasForm(id) {
  const d = id ? db.demirbaslar.find(r => r.id === id) : null;
  modalAc(`
    <h3>${d ? "Demirbaş Güncelle" : "Demirbaş Kaydı"}</h3>
    <label>Parça Tipi *</label>
    <input id="df-tip" value="${esc(d ? d.parca_tipi : "")}" placeholder="örn: Valf">
    <label>Ürün Markası</label>
    <input id="df-marka" value="${esc(d ? d.urun_markasi : "")}" placeholder="örn: KNOR">
    <label>Seri Numarası</label>
    <input id="df-seri" value="${esc(d ? d.seri_no : "")}">
    <label>Adet</label>
    <input id="df-adet" inputmode="numeric" value="${esc(d ? d.adet : "1")}">
    <div class="err" id="df-err"></div>
    <div class="actions">
      <button class="btn btn-s" onclick="${id ? `demirbasDetay(${id})` : "modalKapat()"}">Vazgeç</button>
      <button class="btn btn-p" onclick="demirbasKaydet(${id || 0})">💾 Kaydet</button>
    </div>`);
}

function demirbasKaydet(id) {
  const tip = $("df-tip").value.trim();
  const err = $("df-err"); err.textContent = "";
  if (!tip) { err.textContent = "Parça Tipi zorunludur!"; return; }
  const kayit = {
    parca_tipi: tip, urun_markasi: $("df-marka").value.trim(),
    seri_no: $("df-seri").value.trim(), adet: $("df-adet").value.trim()
  };
  if (id) Object.assign(db.demirbaslar.find(r => r.id === id), kayit);
  else { kayit.id = nextId(db.demirbaslar); db.demirbaslar.push(kayit); }
  DB.save(db);
  modalKapat();
  demirbasListele();
  toast(id ? "Demirbaş güncellendi." : "Yeni demirbaş eklendi.");
}

/* ---------- RAPOR SAYFASI ---------- */
function raporGoster() {
  const el = $("rapor-icerik");
  const v = db.vagonlar;
  const tamam = v.filter(r => r.durum === "Tamamlandı").length;
  const devam = v.filter(r => r.durum === "Bakım devam ediyor").length;
  const bekleyen = v.filter(r => r.durum === "Parça bekliyor").length;
  const ortGun = (() => {
    const sureler = v.map(r => { const g = tarihParse(r.giris_tarihi), b = tarihParse(r.bitis_tarihi);
      return g && b ? (b - g) / 86400000 : null; }).filter(x => x !== null && x >= 0);
    return sureler.length ? (sureler.reduce((a, b) => a + b, 0) / sureler.length).toFixed(1) : "-";
  })();
  const yolda = db.parca_takip.filter(p => !p.gelme_tarihi).length;
  el.innerHTML = `
    <div class="rcard">
      <h4>📊 Genel Durum</h4>
      <p>Toplam ${v.length} vagon kayıtlı</p>
      <div class="vrow" style="font-size:.9rem">
        <span>${badge("Tamamlandı")} <b>${tamam}</b></span>
        <span>${badge("Bakım devam ediyor")} <b>${devam}</b></span>
        <span>${badge("Parça bekliyor")} <b>${bekleyen}</b></span>
      </div>
      <p style="margin-top:10px">Ortalama bakım süresi: <b class="sure">${ortGun} gün</b></p>
      <p>Yolda bekleyen parça: <b class="wait">${yolda}</b></p>
    </div>
    <div class="rcard">
      <h4>📤 Veri Dışa Aktarma</h4>
      <p>Masaüstü programındaki Excel raporunun karşılığı — CSV Excel'de açılır.</p>
      <div class="actions">
        <button class="btn btn-p" onclick="csvAktar('vagonlar')">Vagonlar CSV</button>
        <button class="btn btn-p" onclick="csvAktar('parca_takip')">Parçalar CSV</button>
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="btn btn-p" onclick="csvAktar('demirbaslar')">Demirbaş CSV</button>
        <button class="btn btn-p" onclick="csvAktar('hepsi')">Tümü (Excel)</button>
      </div>
    </div>`;
}

/* CSV uretici (Excel uyumlu, ; ayracli, BOM'lu) */
function csvAktar(ne) {
  const dosyalar = {
    vagonlar: { ad: "Vagon_Ariza_Listesi", b: ["id","Vagon No","Giriş","Kanal","Bitiş","Durum","Açıklama"],
      r: db.vagonlar.map(v => [v.id, v.vagon_no, v.giris_tarihi, v.kanal_tarihi, v.bitis_tarihi, v.durum, v.aciklama]) },
    parca_takip: { ad: "Parcalar_Listesi", b: ["id","Parça Tipi","Marka","Adet","Seri No","Vagon","Sökülme","Gönderilme","Gelme","Arıza Nedeni"],
      r: db.parca_takip.map(p => [p.id, p.parca_tipi, p.urun_markasi, p.adet, p.seri_no, p.vagon_no, p.sokulme_tarihi, p.gonderilme_tarihi, p.gelme_tarihi, p.ariza_nedeni]) },
    demirbaslar: { ad: "Demirbas_Listesi", b: ["id","Parça Tipi","Marka","Seri No","Adet"],
      r: db.demirbaslar.map(d => [d.id, d.parca_tipi, d.urun_markasi, d.seri_no, d.adet]) }
  };
  const csv = (d) => "\uFEFF" + [d.b, ...d.r].map(row =>
    row.map(c => `"${String(c ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`).join(";")).join("\r\n");
  let icerik = "", ad = "";
  if (ne === "hepsi") {
    icerik = [csv(dosyalar.vagonlar), "", csv(dosyalar.parca_takip), "", csv(dosyalar.demirbaslar)].join("\r\n");
    ad = "Vagon_Takip_Raporu";
  } else { icerik = csv(dosyalar[ne]); ad = dosyalar[ne].ad; }
  indir(icerik, `${ad}_${bugun().split(".").join("-")}.csv`, "text/csv;charset=utf-8");
}
function indir(icerik, ad, tip) {
  const blob = new Blob([icerik], { type: tip });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ad;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Yedekleme karti: rapor sayfasina yedek bolumu de ekle */
const yedekHtml = `
    <div class="rcard">
      <h4>💾 Yedekleme</h4>
      <p>Orijinal programdaki yedeklemenin mobil karşılığı. Yedeği farklı bir cihaza taşıyabilirsin.</p>
      <div class="actions">
        <button class="btn btn-p" onclick="yedekAl()">Yedek Al (JSON)</button>
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="btn btn-s" onclick="document.getElementById('geri-yukle-input').click()">Yedeği Geri Yükle</button>
        <input type="file" id="geri-yukle-input" accept=".json" class="hidden" onchange="yedekGeriYukle(this)">
      </div>
    </div>
    <div class="rcard">
      <h4>ℹ️ Hakkında</h4>
      <p>Vagon Bakım ve Takip Sistemi — Mobil sürüm.<br>
      Bu program, atölyeye giren vagonların, kargoya gönderilen parçaların ve atölyedeki demirbaşların takibini yapar.<br>
      Veriler cihazda saklanır; internet bağlantısı gerekmez.</p>
    </div>`;
function raporGoster2() { raporGoster(); $("rapor-icerik").insertAdjacentHTML("beforeend", yedekHtml); }

function yedekAl() {
  indir(JSON.stringify(db), `yedek_vagon_${bugun().split(".").join("-")}.json`, "application/json");
  toast("Yedek dosyası indirildi.");
}
function yedekGeriYukle(input) {
  const f = input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const y = JSON.parse(rd.result);
      if (!y.vagonlar || !y.parca_takip || !y.demirbaslar) throw 0;
      db = y; DB.save(db);
      tumunuYenile();
      toast("Yedek geri yüklendi.");
    } catch (e) { toast("Geçersiz yedek dosyası!", true); }
  };
  rd.readAsText(f);
  input.value = "";
}
function tumunuYenile() {
  secenekleriDoldur();
  vagonListele(); parcaListele(); demirbasListele();
  if (aktifSayfa === "rapor") raporGoster2();
}

/* ---------- FAB ---------- */
$("fab").addEventListener("click", () => {
  if (aktifSayfa === "vagon") vagonForm(0);
  else if (aktifSayfa === "parca") parcaForm(0);
  else if (aktifSayfa === "demirbas") demirbasForm(0);
});

/* ---------- Aylik yedek hatirlatma ---------- */
(function yedekHatirlat() {
  const son = localStorage.getItem("vagon_yedek_hatirlatma");
  const buAy = new Date().toISOString().slice(0, 7);
  if (son !== buAy && db.vagonlar.length > 0) {
    localStorage.setItem("vagon_yedek_hatirlatma", buAy);
    setTimeout(() => toast("Aylık yedek almayı unutmayın! (Rapor → Yedekleme)", true), 1500);
  }
})();

/* ---------- PWA offline ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

/* ---------- Baslangic ---------- */
vagonListele(); parcaListele(); demirbasListele(); secenekleriDoldur();

