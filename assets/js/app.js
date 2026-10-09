/* ===================================================================
   قانون العمل ١٤/٢٠٢٥ — منطق التطبيق الرئيسي
   -------------------------------------------------------------------
   هذا الملف هو نقطة الدخول الرئيسية للتطبيق. يقوم بـ:
   1) بناء نموذج الصفحات من بيانات window.__LAW__
   2) عرض الصفحات (الغلاف، المقدمة، الفواصل، المواد)
   3) إدارة الفهرس الجانبي والبحث
   4) التنقل بين الصفحات + التوجيه عبر hash
   5) حفظ آخر صفحة في localStorage

   يعمل بالكامل في المتصفح بدون أي backend.
   =================================================================== */

(function () {
  'use strict';

  /* ============ 1) Data Source ============ */
  var LAW = window.__LAW__;
  if (!LAW || !LAW.books) {
    // البيانات لم تُحمَّل بشكل صحيح
    console.error('[LaborLaw] window.__LAW__ not found — تأكد من تحميل ملفات البيانات قبل app.js');
    return;
  }

  /* ============ 2) Helpers ============ */

  /**
   * الأرقام العربية الهندية ٠-٩ — تُستخدم لتحويل الأرقام في الواجهة
   * لجعل الموقع يبدو أكثر رسمية ويتوافق مع تنسيق الجريدة الرسمية.
   */
  var ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  /** يحوّل رقمًا أو سلسلة أرقام إنجليزية إلى أرقام عربية هندية */
  function toArabicNum(n) {
    return String(n).replace(/[0-9]/g, function (d) { return ARABIC_DIGITS[+d]; });
  }

  /** يحوّل الأرقام العربية الهندية إلى أرقام إنجليزية (للعمليات الحسابية) */
  function toLatinNum(s) {
    return String(s).replace(/[٠-٩]/g, function (d) { return ARABIC_DIGITS.indexOf(d); });
  }

  /** يقوم بتهريب HTML special chars لمنع XSS عند بناء DOM بالسلاسل النصية */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * تطبيع النص العربي للبحث:
   * - يزيل التشكيل والتطويل
   * - يوحِّد الألف (أ إ آ ا → ا)
   * - يوحِّد الياء (ى → ي)
   * - يوحِّد التاء المربوطة (ة → ه)
   * - يوحِّد الهمزات على واو/ياء
   * - يصغّر الحروف (للبحث غير حساس للحالة)
   */
  function normalizeArabic(s) {
    return String(s)
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // تشكيل + تطويل
      .replace(/[أإآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .toLowerCase();
  }

  /** اختصار لـ document.getElementById */
  function getById(id) { return document.getElementById(id); }

  /* ============ 3) Build Page Model ============ */

  /**
   * PAGES: مصفوفة كل عناصرها كائن يمثل صفحة واحدة في التطبيق
   *   - {type:'cover'}
   *   - {type:'intro'}
   *   - {type:'pdivider'}
   *   - {type:'article', kind:'preamble'|'law', ...}
   *   - {type:'divider', book:idx, bk:bookObj}
   *
   * HASH: خريطة من hash string إلى index في PAGES
   * PAGEHASH: خريطة عكسية من index إلى hash (للاستعادة)
   */
  var PAGES = [];
  var HASH = {};
  var PAGEHASH = {};

  /** يضيف صفحة جديدة إلى PAGES ويسجلها في HASH/PAGEHASH */
  function registerPage(hash, obj) {
    var idx = PAGES.length;
    PAGES.push(obj);
    if (hash) {
      HASH[hash] = idx;
      PAGEHASH[idx] = hash;
    }
    return idx;
  }

  var statArticles = 0;     // عدد المواد في القانون المرافق
  var statPreamble = 0;     // عدد المواد التمهيدية

  /* الصفحات الثابتة */
  registerPage('cover', { type: 'cover' });
  registerPage('intro', { type: 'intro' });
  registerPage('pd', { type: 'pdivider' });

  /* المواد التمهيدية (13 مادة) */
  LAW.preamble.forEach(function (p, i) {
    registerPage('t' + (i + 1), { type: 'article', kind: 'preamble', idx: i, art: p });
    statPreamble++;
  });

  /* كتب القانون المرافق (5 كتب) */
  var BOOK_FIRST = {}; // book idx → page index of divider (لا يُستخدم حاليًا لكن مفيد للتوسع)
  LAW.books.forEach(function (bk, bi) {
    registerPage('b' + (bi + 1), { type: 'divider', book: bi, bk: bk });
    BOOK_FIRST[bi] = PAGES.length - 1;

    function addArticle(a, ci, si) {
      registerPage('m' + a.num, {
        type: 'article', kind: 'law', num: a.num, paras: a.paras,
        book: bi, chapter: ci, section: si
      });
      statArticles++;
    }

    /* مواد الكتاب المباشرة (الأحكام التمهيدية للكتاب) */
    (bk.articles || []).forEach(function (a) { addArticle(a, -1, -1); });

    /* مواد الأبواب */
    (bk.chapters || []).forEach(function (ch, ci) {
      (ch.articles || []).forEach(function (a) { addArticle(a, ci, -1); });
      (ch.sections || []).forEach(function (sec, si) {
        (sec.articles || []).forEach(function (a) { addArticle(a, ci, si); });
      });
    });
  });

  var TOTAL = PAGES.length;

  /* أسماء العدد الترتيبي للمواد التمهيدية (المادة الأولى... الثالثة عشرة) */
  var ORDINALS = [
    'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة',
    'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة',
    'الحادية عشرة', 'الثانية عشرة', 'الثالثة عشرة'
  ];

  /** يُرجع بيانات وصفية لمادة (chip للفهرس، title، where، hash) */
  function getArticleMeta(pg) {
    if (pg.kind === 'preamble') {
      return {
        chip: 'ت' + (pg.idx + 1),
        title: 'المادة ' + ORDINALS[pg.idx],
        where: 'الأحكام التمهيدية',
        hash: 't' + (pg.idx + 1)
      };
    }
    var bk = LAW.books[pg.book];
    var ch = pg.chapter >= 0 ? bk.chapters[pg.chapter] : null;
    var sec = (ch && pg.section >= 0) ? ch.sections[pg.section] : null;
    var where = bk.title + (bk.name ? ' — ' + bk.name : '');
    if (ch) where += ' › ' + ch.label + (ch.name ? ' ' + ch.name : '');
    if (sec) where += ' › ' + sec.label.replace(/[()]/g, '').trim() + (sec.name ? ' ' + sec.name : '');
    return {
      chip: 'م' + pg.num,
      title: 'المادة (' + toArabicNum(pg.num) + ')',
      where: where,
      hash: 'm' + pg.num
    };
  }

  /* ============ 4) DOM References ============ */
  var pageEl = getById('page');
  var tocEl = getById('toc');
  var overlayEl = getById('overlay');
  var burgerEl = getById('burger');
  var toccloseEl = getById('tocclose');
  var searchbtnEl = getById('searchbtn');
  var searchinputEl = getById('searchinput');
  var resultsEl = getById('tocresults');
  var tocbodyEl = getById('tocbody');
  var barEl = document.querySelector('#progress .bar');
  var chipEl = getById('pagechip');

  /** الفهرس الحالي في PAGES (0..TOTAL-1) */
  var currentIdx = 0;

  /* ============ 5) Search Index ============ */

  /**
   * SEARCH: مصفوفة من الكائنات لكل مادة نص قابل للبحث
   * { pi: pageIndex, chip, title, where, text: نص خام, nt: نص مطبَّع }
   */
  var SEARCH = [];
  PAGES.forEach(function (pg, i) {
    if (pg.type === 'article') {
      var m = getArticleMeta(pg);
      var txt = (pg.kind === 'preamble' ? pg.art.text.join(' \n ') : pg.paras.join(' \n '));
      SEARCH.push({ pi: i, chip: m.chip, title: m.title, where: m.where, text: txt, nt: normalizeArabic(txt) });
    }
  });

  /* ============ 6) Render: Linkify (cross-references) ============ */

  /**
   * يحوّل مراجع المواد في النص إلى روابط قابلة للنقر.
   * يدعم: "المادة (N)" / "المادة N من هذا القانون" / أسماء العدد الترتيبي للمواد التمهيدية
   */
  function linkify(s) {
    var out = escapeHtml(s);

    /* المادة (N) */
    out = out.replace(/المادة\s*\(\s*(\d+)\s*\)/g, function (m0, d) {
      var n = +d;
      return (n >= 1 && n <= statArticles)
        ? '<a class="xref" href="#m' + n + '">المادة (' + toArabicNum(n) + ')</a>'
        : m0;
    });

    /* المادة N من هذا القانون */
    out = out.replace(/المادة\s+(\d+)\s+من هذا القانون/g, function (m0, d) {
      var n = +d;
      return (n >= 1 && n <= statArticles)
        ? '<a class="xref" href="#m' + n + '">المادة ' + toArabicNum(n) + ' من هذا القانون</a>'
        : m0;
    });

    /* المواد التمهيدية بأسماء العدد الترتيبي */
    for (var i = 0; i < ORDINALS.length; i++) {
      var re = new RegExp('المادة\\s+' + ORDINALS[i] + '\\s*(?=\\s*(?:من هذا القانون|[,؛.،]))', 'g');
      out = out.replace(re, '<a class="xref" href="#t' + (i + 1) + '">المادة ' + ORDINALS[i] + '</a>');
    }
    return out;
  }

  /* أنماط البنود: "1-" "(أ)" "أ-" "1)" */
  var RE_CLAUSE = /^([٠-٩]{1,3}|[0-9]{1,3})\s*[-–)]\s*(.*)$/;
  var RE_SUB = /^\(?([أ-ي])\)\s+(.*)$/;

  /* ============ 7) Render: Article Page ============ */
  function renderArticle(pg) {
    var m = getArticleMeta(pg);
    var isPre = pg.kind === 'preamble';
    var paras = isPre ? pg.art.text : pg.paras;
    var h = '';

    h += '<div class="crumbs">';
    if (!isPre) {
      var bk = LAW.books[pg.book];
      h += '<a class="crumb" href="#b' + (pg.book + 1) + '">' + escapeHtml(bk.title) + '</a><span class="crumb sep">›</span>';
      if (pg.chapter >= 0) {
        var ch = bk.chapters[pg.chapter];
        h += '<a class="crumb" href="#b' + (pg.book + 1) + '">' + escapeHtml(ch.label + (ch.name ? ': ' + ch.name : '')) + '</a><span class="crumb sep">›</span>';
        if (pg.section >= 0) {
          var sec = ch.sections[pg.section];
          h += '<a class="crumb" href="#b' + (pg.book + 1) + '">' + escapeHtml(sec.label.replace(/[()]/g, '').trim() + (sec.name ? ': ' + sec.name : '')) + '</a><span class="crumb sep">›</span>';
        }
      }
    } else {
      h += '<a class="crumb" href="#pd">الأحكام التمهيدية</a><span class="crumb sep">›</span>';
    }
    h += '<span class="crumb">' + escapeHtml(m.title) + '</span></div>';

    h += '<article class="paper"><div class="art-body" style="padding:0">';
    if (isPre) h += '<div style="text-align:center"><span class="tag-preamble">المقدمة التمهيدية للقانون</span></div>';
    h += '<h2 class="art-title">' + escapeHtml(m.title) + '</h2>';
    h += '<div class="art-sub">' + escapeHtml(m.where) + '</div>';
    h += '<div class="orn" aria-hidden="true"><span class="dia"></span></div>';

    paras.forEach(function (t) {
      var c1 = t.match(RE_CLAUSE);
      if (c1) {
        var label = toArabicNum(toLatinNum(c1[1]));
        var rest = c1[2] || '';
        h += '<div class="clause"><span class="cn">' + label + '</span><div class="ct"><p style="margin:0">' + linkify(rest) + '</p></div></div>';
        return;
      }
      var c2 = t.match(RE_SUB);
      if (c2) {
        h += '<div class="clause"><span class="cn">' + escapeHtml(c2[1]) + '</span><div class="ct"><p style="margin:0">' + linkify(c2[2]) + '</p></div></div>';
        return;
      }
      h += '<p>' + linkify(t) + '</p>';
    });
    h += '</div></article>';
    h += navHtml();
    return h;
  }

  /* ============ 8) Render: Navigation Footer ============ */
  function navHtml() {
    var prev = currentIdx > 0 ? PAGES[currentIdx - 1] : null;
    var next = currentIdx < TOTAL - 1 ? PAGES[currentIdx + 1] : null;

    function lbl(pg, def) {
      if (!pg) return def;
      if (pg.type === 'article') return getArticleMeta(pg).title;
      if (pg.type === 'cover') return 'الغلاف';
      if (pg.type === 'intro') return 'المقدمة';
      if (pg.type === 'pdivider') return 'الأحكام التمهيدية';
      if (pg.type === 'divider') return LAW.books[pg.book].title;
      return def;
    }

    var h = '<nav class="pnav" aria-label="التنقل بين الصفحات">';
    h += '<button class="pbtn prev" id="btnPrev" type="button" ' + (prev ? '' : 'disabled') + '><span>▶ السابق</span><small>' + escapeHtml(lbl(prev, '—')) + '</small></button>';
    h += '<form class="goto" id="gotoForm"><label for="gotoInput">انتقل إلى صفحة</label><input id="gotoInput" inputmode="numeric" pattern="[٠-٩0-9]+" value="' + toArabicNum(currentIdx + 1) + '"><button type="submit">اذهب</button></form>';
    h += '<button class="pbtn next" id="btnNext" type="button" ' + (next ? '' : 'disabled') + '><span>التالي ◀</span><small>' + escapeHtml(lbl(next, '—')) + '</small></button>';
    h += '</nav>';
    return h;
  }

  /* ============ 9) Render: Cover / Intro / Dividers ============ */
  function renderCover() {
    var h = '<div class="cover"><div class="cover-frame"><span class="co3"></span><span class="co4"></span>';
    h += '<div class="kicker">جمهورية مصر العربية</div>';
    h += '<h1>قانون العمل</h1>';
    h += '<div class="sub">رقم ١٤ لسنة ٢٠٢٥ — بإصدار قانون العمل والقانون المرافق</div>';
    h += '<div class="orn2" aria-hidden="true">◆</div>';
    h += '<div class="meta">صدر بالجريدة الرسمية العدد ١٨ (تابع) بتاريخ ٣ مايو ٢٠٢٥<br>يعمل به اعتبارًا من ١ سبتمبر ٢٠٢٥</div>';
    h += '<div class="stats">'
      + '<div class="stat"><b>٥</b><span>كتب</span></div>'
      + '<div class="stat"><b>٢٧</b><span>بابًا</span></div>'
      + '<div class="stat"><b>' + toArabicNum(LAW.preamble.length + statArticles) + '</b><span>مادة</span></div>'
      + '</div>';
    h += '<div class="cover-actions">'
      + '<a class="cbtn gold" href="#intro" data-go="intro">ابدأ القراءة</a>'
      + '<button class="cbtn ghost" id="coverToc" type="button">فهرس القانون</button>'
      + '</div></div></div>';
    return h;
  }

  function renderIntro() {
    var total = LAW.preamble.length + statArticles;
    var h = '<div class="paper">';
    h += '<div class="doc-head">جمهورية مصر العربية — قرر مجلس النواب القانون الآتي نصه، وقد أصدرناه</div>';
    h += '<h2 class="h2">المقدمة</h2>';
    h += '<div class="orn" aria-hidden="true"><span class="dia"></span></div>';
    h += '<p class="intro-p">يعرض هذا الموقع النص الكامل <b>لقانون العمل رقم ١٤ لسنة ٢٠٢٥</b> الصادر بتاريخ ٣ مايو ٢٠٢٥، والذي يعمل به اعتبارًا من <b>١ سبتمبر ٢٠٢٥</b>، ويُلغي القانون رقم ١٢ لسنة ٢٠٠٣ بإصدار قانون العمل. يتكون القانون من ثلاث عشرة مادة تمهيدية تضبط نطاق العمل به، ويصاحبها <b>القانون المرافق</b> الذي يضم التفاصيل التنفيذية موزعة على خمسة كتب.</p>';
    h += '<div class="note gold"><b>محتويات القانون:</b> ٥ كتب — ٢٧ بابًا — ٢٧ فصلًا — ' + toArabicNum(total) + ' مادة (١٣ تمهيدية + ' + toArabicNum(statArticles) + ' في القانون المرافق).</div>';
    h += '<div class="h3">كيف تتنقل في الموقع؟</div>';
    h += '<p class="intro-p">استخدم أزرار <b>«السابق»</b> و<b>«التالي»</b> أسفل كل صفحة للتنقل خطوة بخطوة، أو اكتب رقم الصفحة في خانة <b>«انتقل إلى صفحة»</b> ثم اضغط «اذهب». يفتح زر <b>☰</b> أعلى الشاشة <b>فهرس القانون</b> الكامل، ويمكنك منه الانتقال مباشرة إلى أي كتاب أو باب أو مادة برقمها، أو البحث في نص القانون بكلمة مفتاحية. يشير <b>الشريط الذهبي</b> أعلى الصفحة إلى تقدمك في القراءة.</p>';
    h += '<div class="note"><b>روابط سريعة:</b> ابدأ من <a href="#pd">الأحكام التمهيدية</a>، أو انتقل مباشرة إلى <a href="#b1">الكتاب الأول: التعاريف والأحكام العامة</a>، أو استعرض العناوين في <a href="#" id="introToc">الفهرس الشامل</a>. يمكنك أيضًا استخدام أسهم لوحة المفاتيح (→ للسابق و ← للتالي).</div>';
    h += '<div class="h3">الكتب الخمسة</div>';
    LAW.books.forEach(function (bk, i) {
      var cnt = 0;
      (bk.articles || []).forEach(function () { cnt++; });
      (bk.chapters || []).forEach(function (ch) {
        (ch.articles || []).forEach(function () { cnt++; });
        (ch.sections || []).forEach(function (s) { (s.articles || []).forEach(function () { cnt++; }); });
      });
      h += '<a class="div-row" href="#b' + (i + 1) + '"><span class="dn">' + toArabicNum(i + 1) + '</span><span class="dt"><b>' + escapeHtml(bk.title) + '</b><span>' + escapeHtml(bk.name || '') + ' — ' + toArabicNum(cnt) + ' مادة</span></span><span class="go">◀</span></a>';
    });
    h += '<div class="note gold" style="margin-top:18px"><b>تنويه:</b> هذا الموقع وسيلة توثيق وقراءة، والنص المعتمد قانونًا هو الصادر في الجريدة الرسمية. يُرجى الرجوع إلى الجهات الرسمية عند الحاجة للاستخدام القانوني الرسمي.</div>';
    h += '</div>' + navHtml();
    return h;
  }

  function renderPDivider() {
    var h = '<div class="paper"><div class="divider-hero">';
    h += '<div class="bk">قانون العمل رقم ١٤ لسنة ٢٠٢٥</div>';
    h += '<h2>الأحكام التمهيدية</h2>';
    h += '<div class="ds">المادة الأولى — المادة الثالثة عشرة</div>';
    h += '</div>';
    h += '<p class="intro-p" style="margin-top:16px">تضبط هذه المواد نطاق العمل بأحكام القانون والقانون المرافق، والفئات المستثناة منه، واستمرار الصناديق والمجالس القائمة، وقواعد الانتقال للنظام الجديد، ثم إلغاء القانون السابق ونشر القانون وبدء العمل به.</p>';
    h += '<div class="chiprow">';
    for (var i = 0; i < LAW.preamble.length; i++) {
      h += '<a class="chip" href="#t' + (i + 1) + '">' + ORDINALS[i] + '</a>';
    }
    h += '</div></div>' + navHtml();
    return h;
  }

  function renderDivider(pg) {
    var bk = pg.bk;
    var h = '<div class="paper"><div class="divider-hero">';
    h += '<div class="bk">القانون المرافق</div>';
    h += '<h2>' + escapeHtml(bk.title) + '</h2>';
    h += '<div class="ds">' + escapeHtml(bk.name || '') + '</div>';
    h += '<div class="orn" aria-hidden="true" style="margin-bottom:4px"><span class="dia"></span></div>';
    h += '</div>';

    var rows = [];
    if (bk.articles && bk.articles.length) {
      rows.push({ label: 'أحكام تمهيدية للكتاب', name: 'المواد المباشرة', start: bk.articles[0].num, count: bk.articles.length });
    }
    (bk.chapters || []).forEach(function (ch) {
      var cnt = (ch.articles || []).length;
      (ch.sections || []).forEach(function (s) { cnt += (s.articles || []).length; });
      var first = (ch.articles && ch.articles.length) ? ch.articles[0].num
        : (ch.sections && ch.sections.length && ch.sections[0].articles.length ? ch.sections[0].articles[0].num : null);
      rows.push({ label: ch.label, name: ch.name || '', start: first, count: cnt });
    });

    h += '<div class="div-list">';
    rows.forEach(function (r) {
      var href = r.start ? '#m' + r.start : '#b' + (pg.book + 1);
      h += '<a class="div-row" href="' + href + '"><span class="dn">' + escapeHtml((r.label.split(' ')[1] || r.label).slice(0, 4)) + '</span><span class="dt"><b>' + escapeHtml(r.label) + '</b><span>' + escapeHtml(r.name) + ' — ' + toArabicNum(r.count) + ' مادة' + (r.start ? ' — تبدأ من المادة ' + toArabicNum(r.start) : '') + '</span></span><span class="go">◀</span></a>';
    });
    h += '</div>';

    /* all article chips of this book */
    var chips = [];
    function pushA(a) {
      chips.push('<a class="chip" href="#m' + a.num + '" data-art="' + a.num + '">' + toArabicNum(a.num) + '</a>');
    }
    (bk.articles || []).forEach(pushA);
    (bk.chapters || []).forEach(function (ch) {
      (ch.articles || []).forEach(pushA);
      (ch.sections || []).forEach(function (s) { (s.articles || []).forEach(pushA); });
    });
    if (chips.length) {
      h += '<div class="h3">مواد ' + escapeHtml(bk.title) + '</div><div class="chiprow">' + chips.join('') + '</div>';
    }

    h += '</div>' + navHtml();
    return h;
  }

  /* ============ 10) Render Dispatcher ============ */
  function render() {
    var pg = PAGES[currentIdx];
    var html = '';
    switch (pg.type) {
      case 'cover': html = renderCover(); break;
      case 'intro': html = renderIntro(); break;
      case 'pdivider': html = renderPDivider(); break;
      case 'divider': html = renderDivider(pg); break;
      case 'article': html = renderArticle(pg); break;
    }
    pageEl.innerHTML = html;
    pageEl.className = pg.type === 'cover' ? 'coverpage' : '';
    document.title = pg.type === 'article'
      ? (getArticleMeta(pg).title + ' — قانون العمل ١٤/٢٠٢٥')
      : 'قانون العمل رقم ١٤ لسنة ٢٠٢٥ - النص الكامل';

    /* progress + chip */
    barEl.style.width = ((currentIdx + 1) / TOTAL * 100) + '%';
    chipEl.textContent = toArabicNum(currentIdx + 1) + ' / ' + toArabicNum(TOTAL);

    /* wire nav buttons */
    var bp = getById('btnPrev'), bn = getById('btnNext'), gf = getById('gotoForm'), gi = getById('gotoInput');
    if (bp) bp.addEventListener('click', function () { goTo(currentIdx - 1); });
    if (bn) bn.addEventListener('click', function () { goTo(currentIdx + 1); });
    if (gf) gf.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = parseInt(toLatinNum(gi.value), 10);
      if (!isNaN(v)) {
        var t = v - 1;
        if (t < 0) t = 0;
        if (t > TOTAL - 1) t = TOTAL - 1;
        goTo(t);
      }
    });

    var ct = getById('coverToc');
    if (ct) ct.addEventListener('click', function () { openToc(); });
    var it = getById('introToc');
    if (it) it.addEventListener('click', function (e) { e.preventDefault(); openToc(); });

    highlightToc();
  }

  /* ============ 11) Navigation ============ */
  function goTo(idx, noScroll) {
    if (idx < 0 || idx > TOTAL - 1) return;
    currentIdx = idx;
    pageEl.dataset.page = String(idx);
    render();
    if (noScroll !== true) window.scrollTo({ top: 0, behavior: 'auto' });

    /* save last page */
    try { localStorage.setItem('law14.page', String(currentIdx)); } catch (e) { /* ignore quota errors */ }

    /* update URL hash */
    var h = PAGEHASH[currentIdx];
    if (h) {
      var newUrl = location.pathname + location.search + '#' + h;
      if (location.hash !== '#' + h) {
        try { history.replaceState(null, '', newUrl); }
        catch (e) { location.hash = h; }
      }
    }
  }

  function goToHash(hash) {
    if (!hash) return false;
    hash = hash.replace(/^#/, '');
    if (hash === 'cover' || hash === '') { goTo(HASH['cover']); return true; }
    if (HASH.hasOwnProperty(hash)) { goTo(HASH[hash]); return true; }
    var m;
    if ((m = hash.match(/^m(\d+)$/))) {
      var n = +m[1];
      if (n >= 1 && n <= statArticles && HASH['m' + n] !== undefined) {
        goTo(HASH['m' + n]);
        return true;
      }
    }
    return false;
  }

  /* ============ 12) TOC Building ============ */
  function buildToc() {
    var h = '<div class="toc-quick">'
      + '<a class="q-chip" href="#cover" data-toc="1">الغلاف</a>'
      + '<a class="q-chip" href="#intro" data-toc="1">المقدمة</a>'
      + '<a class="q-chip" href="#pd" data-toc="1">التمهيد</a>'
      + '</div>';

    LAW.books.forEach(function (bk, bi) {
      var cnt = 0;
      (bk.articles || []).forEach(function () { cnt++; });
      (bk.chapters || []).forEach(function (ch) {
        (ch.articles || []).forEach(function () { cnt++; });
        (ch.sections || []).forEach(function (s) { (s.articles || []).forEach(function () { cnt++; }); });
      });
      h += '<details class="toc-book"' + (bi === 0 ? ' open' : '') + ' data-book="' + bi + '">';
      h += '<summary><span>' + escapeHtml(bk.title) + '</span><span class="arrow">◀</span></summary>';
      h += '<div class="toc-inner"><span class="b-name">' + escapeHtml(bk.name || '') + ' — ' + toArabicNum(cnt) + ' مادة</span>';

      if (bk.articles && bk.articles.length) {
        h += '<div class="toc-ch">أحكام تمهيدية للكتاب</div><div class="chips">';
        bk.articles.forEach(function (a) {
          h += '<a class="chip" href="#m' + a.num + '" data-art="' + a.num + '">' + toArabicNum(a.num) + '</a>';
        });
        h += '</div>';
      }

      (bk.chapters || []).forEach(function (ch) {
        h += '<div class="toc-ch">' + escapeHtml(ch.label) + (ch.name ? ' <span class="cn">— ' + escapeHtml(ch.name) + '</span>' : '') + '</div>';
        h += '<div class="chips">';
        (ch.articles || []).forEach(function (a) {
          h += '<a class="chip" href="#m' + a.num + '" data-art="' + a.num + '">' + toArabicNum(a.num) + '</a>';
        });
        (ch.sections || []).forEach(function (s) {
          (s.articles || []).forEach(function (a) {
            h += '<a class="chip" href="#m' + a.num + '" data-art="' + a.num + '" title="' + escapeHtml(s.label.replace(/[()]/g, '').trim() + (s.name ? ' ' + s.name : '')) + '">' + toArabicNum(a.num) + '</a>';
          });
        });
        h += '</div>';
      });
      h += '</div></details>';
    });

    tocbodyEl.innerHTML = h;
  }

  function highlightToc() {
    var active = tocbodyEl.querySelector('.chip.active');
    if (active) active.classList.remove('active');
    var pg = PAGES[currentIdx];
    var key = null;
    if (pg.type === 'article' && pg.kind !== 'preamble') {
      key = 'm' + pg.num;
    }
    if (key) {
      var el = tocbodyEl.querySelector('.chip[data-art="' + key.slice(1) + '"]');
      if (el) {
        el.classList.add('active');
        try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
      }
    }
  }

  /* ============ 13) Drawer (open/close) ============ */
  var lastFocus = null;

  function openToc() {
    lastFocus = document.activeElement;
    tocEl.classList.add('open');
    tocEl.setAttribute('aria-hidden', 'false');
    overlayEl.classList.add('show');
    overlayEl.setAttribute('aria-hidden', 'false');
    burgerEl.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    try { if (tocbodyEl) tocbodyEl.scrollTop = 0; } catch (e) { /* ignore */ }
    setTimeout(function () {
      if (window.matchMedia('(min-width:1120px)').matches) {
        searchinputEl.focus();
      } else {
        toccloseEl.focus();
      }
    }, 60);
  }

  function closeToc() {
    tocEl.classList.remove('open');
    tocEl.setAttribute('aria-hidden', 'true');
    overlayEl.classList.remove('show');
    overlayEl.setAttribute('aria-hidden', 'true');
    burgerEl.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (e) { /* ignore */ }
    }
  }

  function toggleToc() {
    if (tocEl.classList.contains('open')) closeToc();
    else openToc();
  }

  /* ============ 14) Search ============ */
  function doSearch(qRaw) {
    var q = normalizeArabic(qRaw.trim());
    resultsEl.innerHTML = '';
    if (q.length < 2) return;

    /* direct article number jump */
    var numQ = qRaw.trim().replace(/[٠-٩]/g, function (d) { return ARABIC_DIGITS.indexOf(d); }).replace(/[^0-9]/g, '');
    var jumpHtml = '';
    if (numQ !== '' && +numQ >= 1 && +numQ <= statArticles) {
      jumpHtml = '<a class="r-item" href="#m' + (+numQ) + '" data-pi="' + HASH['m' + (+numQ)] + '"><span class="r-t">الانتقال إلى المادة (' + toArabicNum(+numQ) + ')</span></a>';
    }

    var hits = [];
    for (var i = 0; i < SEARCH.length && hits.length < 40; i++) {
      var idx = SEARCH[i].nt.indexOf(q);
      if (idx >= 0) hits.push({ s: SEARCH[i], at: idx });
    }

    if (!hits.length && !jumpHtml) {
      resultsEl.innerHTML = '<div class="r-item" style="cursor:default"><span class="r-t">لا توجد نتائج مطابقة</span><span class="r-s">جرّب كلمة أخرى أو رقم مادة</span></div>';
      return;
    }

    var html = jumpHtml;
    hits.slice(0, 30).forEach(function (hit) {
      var s = hit.s;
      var start = Math.max(0, hit.at - 60);
      var end = Math.min(s.text.length, hit.at + q.length + 110);
      var snip = (start > 0 ? '…' : '') + s.text.slice(start, end).replace(/\n/g, ' … ') + (end < s.text.length ? '…' : '');
      html += '<a class="r-item" href="#' + PAGEHASH[s.pi] + '" data-pi="' + s.pi + '"><span class="r-t">' + escapeHtml(s.title) + ' <span style="color:#6b7d75;font-weight:400">— ' + escapeHtml(s.where) + '</span></span><span class="r-s">' + escapeHtml(snip) + '</span></a>';
    });
    resultsEl.innerHTML = html;
  }

  /* ============ 15) Event Listeners ============ */
  burgerEl.addEventListener('click', toggleToc);
  toccloseEl.addEventListener('click', closeToc);
  overlayEl.addEventListener('click', closeToc);

  searchbtnEl.addEventListener('click', function () {
    openToc();
    setTimeout(function () { searchinputEl.focus(); }, 80);
  });

  searchinputEl.addEventListener('input', function () {
    doSearch(searchinputEl.value);
  });

  /* keyboard navigation (Esc, ArrowLeft, ArrowRight) */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && tocEl.classList.contains('open')) {
      closeToc();
      return;
    }
    /* don't intercept arrow keys while typing */
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    /* RTL: ArrowLeft = next, ArrowRight = prev */
    if (e.key === 'ArrowLeft') goTo(currentIdx + 1);
    else if (e.key === 'ArrowRight') goTo(currentIdx - 1);
  });

  /* delegated clicks: internal hash links, results, xrefs */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href === '#') return;
    var hash = href.slice(1);
    if (goToHash(hash)) {
      e.preventDefault();
      /* close drawer on mobile after jump */
      if (window.matchMedia('(max-width:1119.98px)').matches && tocEl.classList.contains('open')) {
        closeToc();
      }
    }
  });

  /* hash change (back/forward buttons) */
  window.addEventListener('hashchange', function () {
    goToHash(location.hash);
  });

  /* ============ 16) Boot ============ */
  buildToc();

  var restored = false;
  try {
    if (location.hash) restored = goToHash(location.hash);
    if (!restored) {
      var saved = parseInt(localStorage.getItem('law14.page') || '0', 10);
      if (!isNaN(saved) && saved >= 0 && saved < TOTAL) {
        goTo(saved, true);
        restored = true;
      }
    }
  } catch (e) { /* ignore */ }
  if (!restored) goTo(0, true);

})();
