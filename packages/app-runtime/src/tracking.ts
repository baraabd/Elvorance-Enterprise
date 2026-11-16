// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* Real, explicitly consented location sharing. No CRM seed coordinates are used.
 * The same-origin worker owns sessions and freshness; this module owns GPS consent.
 */
export function installSiteTracking(options = {}) {
  if (window.ElvoranceTracking) return;
  const A = options.runtime || window.Elvorance;
  if (!A) return;
  const STORAGE_KEY = 'elvorance.tracking.device.v1';
  const POLL_MS = 5000,
    READING_MS = 15000,
    FRESH_MS = 45000;
  const statuses = {
    idle: 'المشاركة متوقفة',
    starting: 'جارٍ الاتصال',
    waiting: 'بانتظار قراءة جديدة',
    live: 'موقع حديث',
    stale: 'آخر قراءة قديمة',
    paused: 'متوقفة مؤقتًا',
    error: 'تحتاج متابعة',
    stopped: 'انتهت المشاركة',
    unavailable: 'غير متصل بالخدمة',
  };
  const escape = (value) => A.esc(value == null ? '' : String(value));
  const dateText = (value) =>
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat('ar', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          numberingSystem: 'latn',
        }).format(new Date(value))
      : 'لا توجد قراءة';
  const visible = () => document.visibilityState !== 'hidden';
  const shown = (element) => {
    if (!element || element.closest('[hidden],[aria-hidden="true"]')) return false;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const online = () => navigator.onLine !== false;
  const hosted = () => !options.disabled && /^https?:$/.test(location.protocol);
  const finitePoint = (point) =>
    point &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude)) &&
    point.latitude !== null &&
    point.longitude !== null &&
    Math.abs(Number(point.latitude)) <= 90 &&
    Math.abs(Number(point.longitude)) <= 180;
  let session = restoreSession();
  let phase = session ? 'paused' : 'idle';
  let detail = session
    ? 'الجلسة محفوظة. اضغط استئناف بعد الموافقة؛ الموقع لا يعمل تلقائيًا.'
    : 'شارك موقع جهازك أثناء العمل، عندما تختار ذلك.';
  let available = null,
    consentChecked = false,
    runningConsent = false,
    busy = false;
  let watchId = null,
    uploadTimer = null,
    readingTimer = null,
    staleTimer = null;
  let latestPoint = null,
    acknowledged = null,
    lastSentTimestamp = 0,
    highestTimestamp = 0;
  let uploading = false,
    requestingPosition = false,
    generation = 0,
    lastGpsError = '';
  let stateQueue = Promise.resolve();
  let adminRows = [],
    adminError = '',
    adminUpdatedAt = null,
    adminTimer = null,
    adminLoading = false,
    selectedRep = '',
    serverOffset = 0,
    staleAfter = FRESH_MS;
  let mounted = false,
    statusLoading = false;

  function restoreSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (
        saved &&
        /^[a-f0-9]{64}$/i.test(saved.key || '') &&
        /^rep-[\w-]+$/.test(saved.repId || '') &&
        (!saved.sessionId || /^track-[\w-]+$/.test(saved.sessionId))
      )
        return { ...saved, sequence: Number.isSafeInteger(saved.sequence) ? saved.sequence : 0 };
    } catch {
      /* A blocked storage area is explained before sharing starts. */
    }
    return null;
  }

  function saveSession() {
    try {
      if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function makeKey() {
    if (!window.crypto?.getRandomValues)
      throw new Error('المتصفح لا يتيح إنشاء مفتاح جلسة آمن. افتح النسخة المستضافة.');
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function request(path, options = {}) {
    if (!hosted())
      throw Object.assign(
        new Error('افتح النسخة المستضافة لتشغيل خدمة الموقع؛ ملفات HTML المحلية لا تتصل بها.'),
        { code: 'static_environment' },
      );
    if (!online())
      throw Object.assign(new Error('لا يوجد اتصال. ستبقى مشاركة الموقع متوقفة مؤقتًا.'), {
        code: 'offline',
      });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const headers = { Accept: 'application/json' };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.key) headers.Authorization = 'Bearer ' + options.key;
    try {
      const response = await fetch('/api/tracking/' + path, {
        method: options.body ? 'POST' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
        keepalive: Boolean(options.keepalive),
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw Object.assign(
          new Error('هذا العنوان لا يقدم خدمة الموقع. افتح التطبيق المستضاف وحاول مجددًا.'),
          { code: 'invalid_response' },
        );
      }
      if (!response.ok || result.available === false)
        throw Object.assign(new Error(result.message || 'تعذر الاتصال بخدمة الموقع.'), {
          code: result.code || 'tracking_unavailable',
          status: response.status,
        });
      return result;
    } catch (error) {
      if (error.name === 'AbortError')
        throw Object.assign(new Error('تأخر اتصال خدمة الموقع. أعد المحاولة.'), {
          code: 'network_timeout',
        });
      if (!error.code)
        throw Object.assign(new Error('تعذر الاتصال بخدمة الموقع. راجع الشبكة ثم أعد المحاولة.'), {
          code: 'network_error',
        });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function currentRep() {
    const state = A.state();
    return state?.reps?.find((rep) => rep.id === state.session.repId);
  }

  function effectiveStatus(row, now = Date.now() + serverOffset) {
    if (!row) return 'waiting';
    const status = row.status || 'waiting';
    if (status === 'stopped' || (row.expiresAt && Date.parse(row.expiresAt) <= now))
      return 'stopped';
    if (status === 'live') {
      const captured = Date.parse(row.capturedAt || ''),
        heartbeat = Date.parse(row.lastHeartbeat || '');
      if (!finitePoint(row) || !Number.isFinite(captured)) return 'waiting';
      if (
        now - captured > staleAfter ||
        captured > now + 30000 ||
        !Number.isFinite(heartbeat) ||
        now - heartbeat > staleAfter
      )
        return 'stale';
    }
    return ['live', 'stale', 'waiting', 'paused', 'error'].includes(status) ? status : 'waiting';
  }

  function badge(status) {
    return `<span class="tracking-badge tracking-${escape(status)}"><i></i>${escape(statuses[status] || statuses.error)}</span>`;
  }
  function action(name, text, extra = '', secondary = false) {
    return `<button type="button" class="btn ${secondary ? 'btn-secondary' : 'btn-primary'}" data-track-action="${escape(name)}" ${extra}>${escape(text)}</button>`;
  }
  function summaryPoint(point) {
    if (!finitePoint(point))
      return '<p class="tracking-small tracking-muted">لم تصل إحداثيات جديدة من هذا الجهاز بعد.</p>';
    return `<div class="tracking-metrics"><div><span>خط العرض</span><strong dir="ltr">${Number(point.latitude).toFixed(6)}</strong></div><div><span>خط الطول</span><strong dir="ltr">${Number(point.longitude).toFixed(6)}</strong></div><div><span>دقة الجهاز</span><strong>± <bdi>${Math.round(Number(point.accuracy) || 0)}</bdi> م</strong></div><div><span>وقت القراءة</span><strong>${escape(dateText(point.capturedAt))}</strong></div></div>`;
  }

  function renderControls() {
    if (
      runningConsent &&
      phase === 'live' &&
      acknowledged &&
      effectiveStatus(acknowledged, Date.now()) !== 'live'
    )
      phase = 'stale';
    document.querySelectorAll('[data-elvorance-tracking-control]').forEach((holder, index) => {
      const focused = holder.contains(document.activeElement)
        ? document.activeElement?.dataset.trackAction
        : null;
      const rep = currentRep(),
        canResume = session?.sessionId && !session.pendingStop;
      holder.innerHTML = `<section class="tracking-card" aria-label="مشاركة الموقع الحقيقي"><div class="tracking-heading"><div class="tracking-title"><span class="icon-box icon-box-lime">${A.icon('pin')}</span><div><h3>موقعي أثناء العمل</h3><p>${escape(rep?.name || 'المندوب')}</p></div></div>${badge(phase)}</div><p class="tracking-message" role="status" aria-live="polite">${escape(detail)}</p>${summaryPoint(acknowledged)}${!runningConsent && !session?.pendingStop ? `<label class="tracking-consent" for="tracking-consent-${index}"><input id="tracking-consent-${index}" type="checkbox" data-tracking-consent ${consentChecked ? 'checked' : ''}><span>أوافق على مشاركة موقع هذا الجهاز مع لوحة المتابعة، ويمكنني إيقافه في أي وقت.</span></label>` : ''}<div class="tracking-actions">${!runningConsent && !session?.pendingStop ? action('start', busy ? 'جارٍ الاتصال…' : canResume ? 'استئناف المشاركة' : 'بدء مشاركة الموقع', busy || !rep ? 'disabled' : '') : ''}${runningConsent ? action('fresh', 'طلب قراءة جديدة', busy || !online() || !visible() ? 'disabled' : '', true) : ''}${session?.sessionId || runningConsent ? action('stop', session?.pendingStop ? 'إعادة تأكيد الإيقاف' : 'إيقاف المشاركة', busy ? 'disabled' : '', true) : ''}${available === false ? action('retry-service', 'فحص الاتصال', busy ? 'disabled' : '', true) : ''}</div><p class="tracking-footnote">تحتاج المشاركة بقاء التطبيق مفتوحًا وقراءة GPS جديدة. عند إخفاء الصفحة تتوقف مؤقتًا؛ لا تعتمد عليها كتتبع في الخلفية على iPhone.</p></section>`;
      if (focused) holder.querySelector(`[data-track-action="${focused}"]`)?.focus();
    });
  }

  function clearGps() {
    generation++;
    if (watchId !== null) {
      try {
        navigator.geolocation?.clearWatch(watchId);
      } catch {}
      watchId = null;
    }
    if (uploadTimer !== null) clearInterval(uploadTimer);
    if (readingTimer !== null) clearInterval(readingTimer);
    if (staleTimer !== null) clearInterval(staleTimer);
    uploadTimer = readingTimer = staleTimer = null;
    requestingPosition = false;
    latestPoint = null;
  }

  function expireSession(message) {
    clearGps();
    runningConsent = false;
    session = null;
    saveSession();
    acknowledged = null;
    phase = 'stopped';
    detail = message || 'انتهت الجلسة أو أوقفتها الإدارة. يمكنك بدء جلسة جديدة.';
    busy = false;
    renderControls();
  }

  async function stateRequest(state, errorCode, keepalive = false) {
    if (!session?.sessionId) return false;
    const snapshot = { ...session };
    const task = async () => {
      if (!session || session.sessionId !== snapshot.sessionId) return false;
      try {
        await request('sessions/' + encodeURIComponent(snapshot.sessionId) + '/state', {
          key: snapshot.key,
          body: { state, ...(errorCode ? { errorCode } : {}) },
          keepalive,
        });
        if (state === 'stopped' && session?.sessionId === snapshot.sessionId) {
          session = null;
          saveSession();
        }
        return true;
      } catch (error) {
        if (error.code === 'session_expired') {
          expireSession('انتهت الجلسة أو أوقفتها الإدارة. لم يعد الجهاز يشارك موقعه.');
          return false;
        }
        return false;
      }
    };
    stateQueue = stateQueue.then(task, task);
    return stateQueue;
  }

  async function checkService() {
    if (statusLoading) return;
    statusLoading = true;
    try {
      const result = await request('status');
      if (result.available !== true) throw new Error('خدمة الموقع غير متاحة.');
      available = true;
      staleAfter = Number(result.staleAfterMs) || FRESH_MS;
      if (phase === 'unavailable' && !runningConsent) {
        phase = session ? 'paused' : 'idle';
        detail = session
          ? 'عاد الاتصال. اضغط استئناف بعد الموافقة.'
          : 'الخدمة متصلة. ابدأ المشاركة عندما تختار ذلك.';
      }
    } catch (error) {
      available = false;
      if (!runningConsent) {
        phase = 'unavailable';
        detail = error.message || 'خدمة الموقع غير متصلة بهذا العنوان.';
      }
    } finally {
      statusLoading = false;
      renderControls();
    }
  }

  async function startSharing(holder) {
    if (busy || runningConsent) return;
    const rep = currentRep();
    if (!holder?.querySelector('[data-tracking-consent]')?.checked) {
      detail = 'أكد موافقتك أولًا، ثم اضغط بدء أو استئناف.';
      renderControls();
      return;
    }
    if (!rep) {
      phase = 'error';
      detail = 'لم يتحدد حساب المندوب.';
      renderControls();
      return;
    }
    if (!hosted() || window.isSecureContext === false || !navigator.geolocation) {
      phase = 'unavailable';
      detail = !hosted()
        ? 'افتح النسخة المستضافة لمشاركة الموقع الحقيقي.'
        : !navigator.geolocation
          ? 'المتصفح لا يتيح الموقع على هذا الجهاز.'
          : 'يحتاج الموقع اتصال HTTPS آمنًا.';
      renderControls();
      return;
    }
    if (!online() || !visible()) {
      phase = 'paused';
      detail = 'أبقِ الصفحة ظاهرة مع اتصال بالإنترنت، ثم أعد المحاولة.';
      renderControls();
      return;
    }
    busy = true;
    phase = 'starting';
    detail = 'جارٍ فتح جلسة الموقع…';
    consentChecked = true;
    renderControls();
    try {
      if (session?.pendingStop) throw new Error('أكد إيقاف الجلسة السابقة قبل البدء.');
      if (
        session &&
        (session.repId !== rep.id ||
          (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()))
      ) {
        session = null;
        saveSession();
      }
      if (!session)
        session = {
          key: makeKey(),
          repId: rep.id,
          repName: rep.name,
          sessionId: null,
          sequence: 0,
          expiresAt: null,
        };
      if (!saveSession())
        throw new Error('تعذر حفظ مفتاح الجلسة في هذا التبويب. اسمح بتخزين الجلسة ثم حاول مجددًا.');
      const created = await request('sessions', {
        key: session.key,
        body: { repId: rep.id, repName: rep.name, consent: true },
      });
      if (!created.session?.sessionId) throw new Error('استجابة جلسة الموقع غير مكتملة.');
      session = {
        ...session,
        sessionId: created.session.sessionId,
        expiresAt: created.session.expiresAt,
        sequence: Math.max(session.sequence || 0, Number(created.session.sequence) || 0),
      };
      if (!saveSession())
        throw new Error('تعذر حفظ الجلسة. لم يبدأ GPS؛ أوقف الجلسة ثم راجع إعدادات المتصفح.');
      if (!(await stateRequest('active')))
        throw new Error('تعذر استئناف الجلسة على الخادم. حاول مجددًا.');
      available = true;
      runningConsent = true;
      acknowledged = null;
      latestPoint = null;
      highestTimestamp = 0;
      lastSentTimestamp = 0;
      phase = 'waiting';
      detail = 'اسمح للموقع عند طلب المتصفح. ننتظر قراءة GPS جديدة.';
      if (!visible() || !online()) await pauseSharing(online() ? 'hidden' : 'offline');
      else beginGps();
    } catch (error) {
      runningConsent = false;
      clearGps();
      phase = ['static_environment', 'database_unavailable', 'invalid_response'].includes(
        error.code,
      )
        ? 'unavailable'
        : 'error';
      detail = error.message || 'تعذر بدء مشاركة الموقع.';
      if (['session_expired', 'device_conflict'].includes(error.code)) {
        session = null;
        saveSession();
      }
    } finally {
      busy = false;
      renderControls();
    }
  }

  function beginGps() {
    clearGps();
    if (!runningConsent || !session?.sessionId || !visible() || !online()) return;
    const mine = generation;
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => receivePosition(position, mine),
        (error) => gpsError(error, mine),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
      );
      uploadTimer = setInterval(flushPoint, POLL_MS);
      readingTimer = setInterval(requestFresh, READING_MS);
      staleTimer = setInterval(renderControls, 1000);
      requestFresh();
    } catch {
      gpsError({ code: 1 }, mine);
    }
  }

  function requestFresh() {
    if (!runningConsent || requestingPosition || !session?.sessionId || !visible() || !online())
      return;
    requestingPosition = true;
    const mine = generation;
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (mine === generation) requestingPosition = false;
          receivePosition(position, mine);
        },
        (error) => {
          if (mine === generation) requestingPosition = false;
          gpsError(error, mine);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
      );
    } catch {
      requestingPosition = false;
      gpsError({ code: 1 }, mine);
    }
  }

  function receivePosition(position, mine) {
    if (mine !== generation || !runningConsent || !visible() || !online() || !session?.sessionId)
      return;
    const capturedAt = Number(position?.timestamp),
      coordinates = position?.coords;
    if (
      !Number.isFinite(capturedAt) ||
      !coordinates ||
      !Number.isFinite(coordinates.latitude) ||
      !Number.isFinite(coordinates.longitude) ||
      !Number.isFinite(coordinates.accuracy) ||
      Math.abs(coordinates.latitude) > 90 ||
      Math.abs(coordinates.longitude) > 180 ||
      coordinates.accuracy < 0 ||
      coordinates.accuracy > 100000
    ) {
      phase = 'error';
      detail = 'القراءة غير صالحة. اطلب قراءة GPS جديدة.';
      renderControls();
      return;
    }
    if (Date.now() - capturedAt > staleAfter || capturedAt > Date.now() + 30000) {
      phase = 'stale';
      detail = 'وصلت قراءة قديمة أو توقيت الجهاز غير صحيح. ننتظر قراءة أحدث.';
      renderControls();
      return;
    }
    if (capturedAt < highestTimestamp || capturedAt <= lastSentTimestamp) return;
    highestTimestamp = capturedAt;
    latestPoint = {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      accuracy: coordinates.accuracy,
      capturedAt,
    };
    lastGpsError = '';
    if (!acknowledged) {
      phase = 'waiting';
      detail = 'وصل GPS؛ نؤكد حفظ القراءة في خدمة المتابعة.';
      flushPoint();
    }
  }

  async function flushPoint() {
    if (
      uploading ||
      !runningConsent ||
      !session?.sessionId ||
      !latestPoint ||
      !visible() ||
      !online()
    )
      return;
    if (Date.now() - latestPoint.capturedAt > staleAfter) {
      phase = 'stale';
      detail = 'آخر قراءة قديمة. لا تظهر كموقع حي؛ نطلب قراءة GPS جديدة.';
      renderControls();
      requestFresh();
      return;
    }
    if (latestPoint.capturedAt <= lastSentTimestamp) return;
    uploading = true;
    const mine = generation,
      current = { ...session },
      point = { ...latestPoint, sequence: (session.sequence || 0) + 1 };
    session.sequence = point.sequence;
    if (!saveSession()) {
      uploading = false;
      await stopSharing();
      phase = 'error';
      detail = 'تعذر حفظ ترتيب القراءات؛ أوقفت المشاركة لحماية اتساق الجلسة.';
      renderControls();
      return;
    }
    try {
      // A delayed error/pause update must finish before a later valid reading;
      // otherwise network reordering could overwrite that reading's live state.
      await stateQueue;
      if (mine !== generation || !runningConsent || session?.sessionId !== current.sessionId)
        return;
      const result = await request('sessions/' + encodeURIComponent(current.sessionId) + '/point', {
        key: current.key,
        body: point,
      });
      if (mine !== generation || !runningConsent || session?.sessionId !== current.sessionId)
        return;
      if (result.session?.sequence > session.sequence) {
        session.sequence = result.session.sequence;
        saveSession();
      }
      if (result.accepted === true && result.session) {
        acknowledged = result.session;
        lastSentTimestamp = Math.max(
          lastSentTimestamp,
          Date.parse(result.session.capturedAt || '') || point.capturedAt,
        );
        phase = effectiveStatus(acknowledged, Date.now());
        detail =
          phase === 'live'
            ? 'حُفظت قراءة جديدة من جهازك. وقت القراءة أدناه هو مرجع حداثتها.'
            : 'حُفظت القراءة، لكنها لا تعد موقعًا حديثًا الآن.';
        available = true;
      } else if (result.code === 'out_of_order') {
        lastSentTimestamp = Math.max(
          lastSentTimestamp,
          Date.parse(result.session?.capturedAt || '') || 0,
        );
        latestPoint = null;
        phase = 'waiting';
        detail = 'تجاهلت الخدمة قراءة أقدم. ننتظر قراءة أحدث بالترتيب الصحيح.';
        requestFresh();
      } else {
        phase = 'paused';
        detail = 'لم تقبل الخدمة القراءة. راجع حالة الجلسة قبل الاستئناف.';
      }
    } catch (error) {
      if (mine !== generation) return;
      if (error.code === 'session_expired') {
        expireSession('أوقفت الإدارة الجلسة أو انتهت مدتها. انتهت قراءة الموقع على هذا الجهاز.');
        return;
      }
      if (error.code === 'session_paused') {
        clearGps();
        phase = 'paused';
        runningConsent = false;
        detail = 'الجلسة متوقفة. اضغط استئناف بعد الموافقة.';
      } else if (error.code === 'old_position') {
        latestPoint = null;
        phase = 'stale';
        detail = error.message;
        requestFresh();
      } else {
        phase = 'unavailable';
        available = false;
        detail = 'تعذر إرسال القراءة. لن تظهر كموقع حي حتى يتأكد اتصال جديد.';
      }
    } finally {
      uploading = false;
      renderControls();
    }
  }

  function gpsError(error, mine) {
    if (mine !== generation || !runningConsent) return;
    const code =
      Number(error?.code) === 1
        ? 'permission_denied'
        : Number(error?.code) === 3
          ? 'timeout'
          : 'position_unavailable';
    const messages = {
      permission_denied: 'إذن الموقع مرفوض. فعّله من إعدادات المتصفح ثم اضغط استئناف.',
      timeout: 'انتهت مهلة GPS. أبقِ التطبيق ظاهرًا وحاول قرب مكان مفتوح.',
      position_unavailable: 'تعذر تحديد الموقع حاليًا. نطلب قراءة جديدة من الجهاز.',
    };
    phase = 'error';
    detail = messages[code];
    latestPoint = null;
    if (lastGpsError !== code) {
      lastGpsError = code;
      stateRequest('error', code);
    }
    if (code === 'permission_denied') {
      clearGps();
      runningConsent = false;
    }
    renderControls();
  }

  async function pauseSharing(reason) {
    if (!runningConsent) return;
    clearGps();
    phase = 'paused';
    detail =
      reason === 'offline'
        ? 'انقطع الاتصال؛ أوقفت قراءة الموقع مؤقتًا.'
        : 'الصفحة غير ظاهرة؛ أوقفت قراءة الموقع مؤقتًا.';
    renderControls();
    await stateRequest('paused', reason, true);
  }

  async function resumeVisible() {
    if (session?.pendingStop) {
      await stopSharing();
      return;
    }
    if (!runningConsent || !session?.sessionId || !online() || !visible()) return;
    phase = 'waiting';
    detail = 'عادت الصفحة والاتصال. نطلب قراءة جديدة قبل إظهار موقع حديث.';
    renderControls();
    if (await stateRequest('active')) {
      acknowledged = null;
      beginGps();
    } else {
      phase = 'unavailable';
      detail = 'تعذر استئناف الجلسة. لا توجد قراءة حية مؤكدة.';
      renderControls();
    }
  }

  async function stopSharing() {
    runningConsent = false;
    consentChecked = false;
    clearGps();
    latestPoint = null;
    acknowledged = null;
    if (!session?.sessionId) {
      session = null;
      saveSession();
      phase = 'stopped';
      detail = 'الموقع متوقف على هذا الجهاز.';
      renderControls();
      return;
    }
    session.pendingStop = true;
    saveSession();
    phase = 'stopped';
    detail = 'أوقفت قراءة الموقع. جارٍ تأكيد الإيقاف على الخادم…';
    renderControls();
    const stopped = await stateRequest('stopped', null, true);
    detail =
      stopped || !session
        ? 'انتهت المشاركة وحُذفت إحداثيات الجلسة من المتابعة.'
        : 'أوقفت القراءة على الجهاز، لكن الخادم لم يؤكد الإيقاف. أعد تأكيده عند عودة الاتصال؛ آخر قراءة ستتقادم.';
    renderControls();
  }

  function coordinateMap(rows, selected) {
    const points = rows.filter((row) => finitePoint(row) && effectiveStatus(row) !== 'stopped');
    if (!points.length)
      return '<div class="tracking-map-empty">لا توجد إحداثيات متاحة للرسم.</div>';
    const longitudes = points.map((row) => Number(row.longitude)),
      latitudes = points.map((row) => Number(row.latitude));
    let minX = Math.min(...longitudes),
      maxX = Math.max(...longitudes),
      minY = Math.min(...latitudes),
      maxY = Math.max(...latitudes);
    const spreadX = Math.max(maxX - minX, 0.002),
      spreadY = Math.max(maxY - minY, 0.002);
    const centerX = (minX + maxX) / 2,
      centerY = (minY + maxY) / 2;
    minX = centerX - spreadX * 0.65;
    maxX = centerX + spreadX * 0.65;
    minY = centerY - spreadY * 0.65;
    maxY = centerY + spreadY * 0.65;
    const width = 560,
      height = 260;
    return `<div class="tracking-map"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="مخطط إحداثيات المواقع الواردة من الأجهزة"><rect width="560" height="260" rx="16" fill="#eef2e8"/>${[1, 2, 3, 4].map((n) => `<path d="M${n * 112} 20V230 M25 ${n * 48}H535" stroke="#dce4d5" fill="none"/>`).join('')}<text x="24" y="20" class="tracking-axis">${maxY.toFixed(4)}° N</text><text x="24" y="248" class="tracking-axis">${minX.toFixed(4)}° E</text><text x="440" y="248" class="tracking-axis">${maxX.toFixed(4)}° E</text>${points
      .map((row) => {
        const x = 30 + ((Number(row.longitude) - minX) / (maxX - minX)) * 500,
          y = 25 + ((maxY - Number(row.latitude)) / (maxY - minY)) * 200,
          status = adminError ? 'unavailable' : effectiveStatus(row),
          chosen = row.repId === selected;
        return `<g role="button" tabindex="0" aria-label="اختيار ${escape(row.repName)}" data-track-action="select-rep" data-rep-id="${escape(row.repId)}"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${chosen ? 13 : 9}" fill="${status === 'live' ? '#176b55' : '#7a8376'}" stroke="${chosen ? '#c5f173' : '#fff'}" stroke-width="${chosen ? 5 : 3}"/>${chosen ? `<text x="${x.toFixed(2)}" y="${Math.max(18, y - 22).toFixed(2)}" text-anchor="middle" class="tracking-map-name">${escape(row.repName)}</text>` : ''}</g>`;
      })
      .join(
        '',
      )}</svg><p class="tracking-small tracking-muted">شبكة إحداثيات محلية؛ لا خريطة طرق ولا مواقع افتراضية. الرمادي قراءة غير حية.</p></div>`;
  }

  function renderAdmin() {
    document.querySelectorAll('[data-elvorance-live-team]').forEach((holder) => {
      const rows = holder.dataset.rep
        ? adminRows.filter((row) => row.repId === holder.dataset.rep)
        : adminRows;
      const selected =
        rows.find((row) => row.repId === selectedRep) ||
        rows.find((row) => effectiveStatus(row) === 'live') ||
        rows[0];
      const liveCount = adminError
        ? 0
        : rows.filter((row) => effectiveStatus(row) === 'live').length;
      const status = selected
        ? adminError
          ? 'unavailable'
          : effectiveStatus(selected)
        : 'waiting';
      holder.innerHTML = `<section class="tracking-card tracking-admin" aria-label="مواقع الفريق الفعلية"><div class="tracking-heading"><div><p class="eyebrow">متابعة بموافقة المندوب</p><h3>موقع الفريق الفعلي</h3></div>${action('refresh-team', 'تحديث', adminLoading ? 'disabled' : '', true)}</div><div class="tracking-admin-summary"><strong><bdi>${liveCount}</bdi> مواقع حديثة</strong><span class="tracking-small tracking-muted">${adminUpdatedAt ? `آخر فحص ${escape(dateText(adminUpdatedAt))}` : 'لم يصل فحص بعد'}</span></div>${adminError ? `<p class="tracking-message tracking-warning" role="status">${escape(adminError)} لا تعتبر القراءات السابقة مواقع حية.</p>` : '<p class="tracking-small tracking-muted">الموقع حديث فقط إذا وصلت قراءة GPS جديدة خلال 45 ثانية. تُحدّث القائمة كل 5 ثوانٍ أثناء ظهور الصفحة.</p>'}${rows.length ? `<div class="tracking-admin-grid"><div class="tracking-team-list" aria-label="اختيار المندوب">${rows.map((row) => `<button type="button" class="tracking-person ${row.repId === selected?.repId ? 'is-selected' : ''}" data-track-action="select-rep" data-rep-id="${escape(row.repId)}" aria-pressed="${row.repId === selected?.repId}"><span><strong>${escape(row.repName || row.repId)}</strong><small>${escape(dateText(row.capturedAt))}</small></span>${badge(adminError ? 'unavailable' : effectiveStatus(row))}</button>`).join('')}</div><div>${coordinateMap(rows, selected?.repId)}${selected ? `<div class="tracking-selected"><div class="tracking-heading"><strong>${escape(selected.repName)}</strong>${badge(status)}</div>${summaryPoint(status === 'stopped' ? null : selected)}<div class="tracking-actions">${finitePoint(selected) && status !== 'stopped' ? `<a class="btn btn-secondary" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(selected.latitude)}&amp;mlon=${encodeURIComponent(selected.longitude)}#map=16/${encodeURIComponent(selected.latitude)}/${encodeURIComponent(selected.longitude)}" target="_blank" rel="noopener noreferrer">فتح OpenStreetMap باختياري</a>` : ''}${status !== 'stopped' ? action('admin-stop', 'إيقاف الجلسة', `data-rep-id="${escape(selected.repId)}" data-rep-name="${escape(selected.repName)}"`, true) : ''}</div></div>` : ''}</div></div>` : `<div class="tracking-map-empty">${adminLoading ? 'جارٍ قراءة جلسات الموقع…' : adminError ? 'لا توجد بيانات موقع مؤكدة حاليًا.' : 'لا توجد جلسات مشاركة. يبدأ المندوب من «موقعي أثناء العمل» بعد الموافقة.'}</div>`}<p class="tracking-footnote">لا تُرسل إحداثيات إلى خدمة خرائط خارجية تلقائيًا. رابط OpenStreetMap يفتح فقط باختيارك.</p></section>`;
    });
  }

  async function pollAdmin() {
    if (!visible() || !Array.from(document.querySelectorAll('[data-elvorance-live-team]')).some(shown))
      return;
    // Age existing readings even when a slow request is still pending.
    renderAdmin();
    if (adminLoading) return;
    adminLoading = true;
    const requestedAt = Date.now();
    try {
      const response = await request('locations');
      if (!Array.isArray(response.locations))
        throw new Error('خدمة الموقع غير متاحة على هذا العنوان.');
      adminRows = response.locations;
      serverOffset = Number.isFinite(Date.parse(response.serverNow || ''))
        ? Date.parse(response.serverNow) - requestedAt
        : 0;
      staleAfter = Number(response.staleAfterMs) || FRESH_MS;
      adminUpdatedAt = new Date().toISOString();
      adminError = '';
      available = true;
    } catch (error) {
      adminError = error.message || 'تعذر تحديث مواقع الفريق.';
    } finally {
      adminLoading = false;
      renderAdmin();
    }
  }

  function syncAdminPolling() {
    const shouldPoll =
      visible() && Array.from(document.querySelectorAll('[data-elvorance-live-team]')).some(shown);
    if (!shouldPoll && adminTimer !== null) {
      clearInterval(adminTimer);
      adminTimer = null;
    }
    if (shouldPoll && adminTimer === null) {
      pollAdmin();
      adminTimer = setInterval(pollAdmin, POLL_MS);
    }
  }

  function adminStop(button) {
    const repId = button.dataset.repId,
      repName = button.dataset.repName || repId;
    A.confirm(
      'إيقاف جلسة ' + repName + '؟',
      'يتوقف قبول المواقع لهذه الجلسة وتُحذف إحداثياتها. يستطيع المندوب بدء جلسة جديدة بموافقته.',
      async () => {
        try {
          await request('admin/stop', { body: { repId } });
          adminRows = adminRows.map((row) =>
            row.repId === repId
              ? {
                  ...row,
                  status: 'stopped',
                  latitude: null,
                  longitude: null,
                  accuracy: null,
                  capturedAt: null,
                }
              : row,
          );
          renderAdmin();
          A.toast('أوقفت جلسة الموقع. يستطيع المندوب بدء جلسة جديدة.', 'success');
          await pollAdmin();
        } catch (error) {
          A.toast(error.message || 'تعذر إيقاف الجلسة.', 'error');
        }
      },
    );
  }

  function mount() {
    const hasControls = Boolean(document.querySelector('[data-elvorance-tracking-control]'));
    if (hasControls) {
      renderControls();
      if (!mounted) checkService();
    }
    renderAdmin();
    syncAdminPolling();
    mounted ||= hasControls;
    if (session?.pendingStop && online()) stopSharing();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-track-action]');
    if (!button || button.disabled) return;
    event.preventDefault();
    const name = button.dataset.trackAction;
    if (name === 'start') startSharing(button.closest('[data-elvorance-tracking-control]'));
    else if (name === 'stop') stopSharing();
    else if (name === 'fresh') requestFresh();
    else if (name === 'retry-service') checkService();
    else if (name === 'refresh-team') pollAdmin();
    else if (name === 'select-rep') {
      selectedRep = button.dataset.repId;
      renderAdmin();
    } else if (name === 'admin-stop') adminStop(button);
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-tracking-consent]')) consentChecked = event.target.checked;
  });
  document.addEventListener('keydown', (event) => {
    if (['Enter', ' '].includes(event.key) && event.target.matches('g[data-track-action]')) {
      event.preventDefault();
      event.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!visible()) pauseSharing('hidden');
    else resumeVisible();
    syncAdminPolling();
    renderAdmin();
  });
  window.addEventListener('offline', () => {
    pauseSharing('offline');
    adminError = 'انقطع الاتصال بخدمة الموقع.';
    renderAdmin();
  });
  window.addEventListener('online', () => {
    resumeVisible();
    if (visible()) pollAdmin();
  });
  window.addEventListener('pagehide', () => {
    pauseSharing('hidden');
  });
  window.addEventListener('elvorance:render', mount);
  document.addEventListener('elvorance:render', mount);
  window.ElvoranceTracking = { mount };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  return window.ElvoranceTracking;
}
