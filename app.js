const $ = (selector) => document.querySelector(selector);

let currentLanguage = "ar";
let currentPage = "dashboard";

const STORAGE_KEY = "dr-mohamed-helmy-clinic:data:v1";

let patients = [];
let queue = [];
let nextQueueNumber = 1;
let storageStatus = "ready";
let backupStatus = "";
let lastRecordId = 0;
let editingVisitId = null;


// ========================================
// أدوات مساعدة
// ========================================

function getTodayDate() {
  const today = new Date();

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");
}


function normalizePhone(phone) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

  return String(phone ?? "")
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/\D/g, "");
}


function normalizeName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}


function createRecordId() {
  let id = Math.max(Date.now(), lastRecordId + 1);

  while (
    patients.some((patient) => patient.id === id) ||
    queue.some((visit) => visit.id === id)
  ) {
    id += 1;
  }

  lastRecordId = id;
  return id;
}


function findPatientByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  return patients.find(
    (patient) => normalizePhone(patient.phone) === normalizedPhone
  ) || null;
}


function getPreviousCompletedExam(patientId, consultationDate) {
  return queue
    .filter((visit) => (
      visit.patientId === patientId &&
      visit.type === "exam" &&
      visit.status === "done" &&
      visit.date <= consultationDate
    ))
    .sort((first, second) => second.date.localeCompare(first.date))[0] || null;
}


function checkExamEligibility() {
  const phone = $("#patient-phone")?.value.trim();
  const message = $("#exam-check-message");
  if (!message) return;

  if (!phone) {
    setExamCheckMessage(currentLanguage === "ar"
      ? "اكتب رقم التلفون الأول."
      : "Enter a phone number first.", "info");
    return;
  }

  const patient = findPatientByPhone(phone);
  if (!patient) {
    setExamCheckMessage(currentLanguage === "ar"
      ? "مفيش ملف مسجل بالرقم ده. سجّل كشف جديد الأول."
      : "No patient record found for this number. Register an examination first.", "error");
    return;
  }

  const consultationDate = $("#visit-date")?.value || getTodayDate();
  const previousExam = getPreviousCompletedExam(patient.id, consultationDate);

  setExamCheckMessage(previousExam
    ? (currentLanguage === "ar"
        ? `المريض مسجل، وآخر كشف مكتمل بتاريخ ${previousExam.date}. يمكن تسجيل استشارة.`
        : `Patient found. Last completed examination: ${previousExam.date}. Consultation is allowed.`)
    : (currentLanguage === "ar"
        ? "المريض مسجل، لكن مفيش كشف مكتمل قبل تاريخ الاستشارة المختار."
        : "Patient found, but there is no completed examination before the selected consultation date."),
    previousExam ? "success" : "error");
}


function setExamCheckMessage(text, state = "info") {
  const message = $("#exam-check-message");
  if (!message) return;

  message.textContent = text;
  message.dataset.state = state;
}


function setBackupMessage(key) {
  backupStatus = key;

  const messages = {
    downloaded: {
      ar: "تم تنزيل النسخة الاحتياطية. احتفظ بها في مكان آمن.",
      en: "Backup downloaded. Keep it somewhere safe."
    },
    invalid: {
      ar: "الملف غير صالح أو لا يحتوي على نسخة احتياطية للعيادة.",
      en: "This file is not a valid clinic backup."
    },
    saveError: {
      ar: "تعذر حفظ النسخة على هذا الجهاز.",
      en: "Could not save the backup on this device."
    },
    restored: {
      ar: "تمت استعادة البيانات بنجاح.",
      en: "Data restored successfully."
    }
  };

  const message = $("#backup-message");
  if (message) {
    message.textContent = messages[key]?.[currentLanguage] || "";
  }
}


function isValidClinicData(data) {
  if (
    !data ||
    data.version !== 1 ||
    typeof data.nextQueueNumber !== "number" ||
    !Number.isFinite(data.nextQueueNumber) ||
    !Array.isArray(data.patients) ||
    !Array.isArray(data.queue)
  ) {
    return false;
  }

  const patientIds = new Set();
  const validPatients = data.patients.every((patient) => {
    if (
      !patient ||
      typeof patient.id !== "number" ||
      !Number.isFinite(patient.id) ||
      typeof patient.name !== "string" ||
      typeof patient.phone !== "string"
    ) {
      return false;
    }

    if (patientIds.has(Number(patient.id))) return false;
    patientIds.add(Number(patient.id));
    return true;
  });

  if (!validPatients) return false;

  return data.queue.every((visit) => (
    visit &&
    typeof visit.id === "number" &&
    Number.isFinite(visit.id) &&
    typeof visit.queueNumber === "number" &&
    Number.isFinite(visit.queueNumber) &&
    typeof visit.patientId === "number" &&
    patientIds.has(visit.patientId) &&
    (visit.type === "exam" || visit.type === "consultation") &&
    ["waiting", "in_doctor", "done"].includes(visit.status) &&
    typeof visit.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(visit.date)
  ));
}


function updateStorageStatus() {
  const status = $("#storage-status");
  if (!status) return;

  const messages = {
    ready: {
      ar: "الحفظ التلقائي مفعّل على هذا الجهاز.",
      en: "Automatic saving is enabled on this device."
    },
    loaded: {
      ar: "تم استرجاع البيانات المحفوظة على هذا الجهاز.",
      en: "Saved data was loaded from this device."
    },
    saved: {
      ar: "تم حفظ التغييرات على هذا الجهاز.",
      en: "Changes were saved on this device."
    },
    error: {
      ar: "تعذر حفظ البيانات. نزّل نسخة احتياطية الآن.",
      en: "Data could not be saved. Download a backup now."
    }
  };

  status.textContent = messages[storageStatus][currentLanguage];
}


function loadClinicData() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (!savedData) {
      updateStorageStatus();
      return;
    }

    const data = JSON.parse(savedData);
    if (!isValidClinicData(data)) {
      storageStatus = "error";
      updateStorageStatus();
      return;
    }

    patients = data.patients;
    queue = data.queue;

    const highestQueueNumber = queue.reduce(
      (highest, visit) => Math.max(highest, Number(visit.queueNumber) || 0),
      0
    );

    nextQueueNumber = Math.max(
      Number(data.nextQueueNumber) || 1,
      highestQueueNumber + 1
    );

    storageStatus = "loaded";
  } catch (error) {
    storageStatus = "error";
  }

  updateStorageStatus();
}


function saveClinicData() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        patients,
        queue,
        nextQueueNumber,
        savedAt: new Date().toISOString()
      })
    );

    storageStatus = "saved";
    updateStorageStatus();
    return true;
  } catch (error) {
    storageStatus = "error";
    updateStorageStatus();
    return false;
  }
}


function exportClinicData() {
  const data = {
    version: 1,
    patients,
    queue,
    nextQueueNumber,
    savedAt: new Date().toISOString()
  };
  const file = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );
  const fileUrl = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = fileUrl;
  link.download = `clinic-data-${getTodayDate()}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);

  setBackupMessage("downloaded");
}


async function importClinicData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (!isValidClinicData(data)) {
      throw new Error("invalid backup");
    }

    const confirmed = window.confirm(
      currentLanguage === "ar"
        ? "استعادة النسخة ستستبدل البيانات الحالية على هذا الجهاز. هل تريد المتابعة؟"
        : "Restoring this backup will replace the current data on this device. Continue?"
    );

    if (!confirmed) return;

    patients = data.patients;
    queue = data.queue;
    const highestQueueNumber = data.queue.reduce(
      (highest, visit) => Math.max(highest, Number(visit.queueNumber) || 0),
      0
    );
    nextQueueNumber = Math.max(
      Number(data.nextQueueNumber) || 1,
      highestQueueNumber + 1
    );

    if (!saveClinicData()) {
      setBackupMessage("saveError");
      return;
    }

    renderPatients();
    renderQueue();
    updateDashboard();

    setBackupMessage("restored");
  } catch (error) {
    setBackupMessage("invalid");
  } finally {
    event.target.value = "";
  }
}


function openVisitEditor(visit) {
  if (visit.status !== "waiting") return;

  editingVisitId = visit.id;
  $("#edit-visit-type").value = visit.type;
  $("#edit-visit-date").value = visit.date;
  $("#edit-visit-reason").value = visit.reason || "";
  $("#edit-visit-message").textContent = "";
  $("#edit-visit-dialog").showModal();
}


function saveEditedVisit(event) {
  event.preventDefault();

  const visit = queue.find((item) => item.id === editingVisitId);
  if (!visit || visit.status !== "waiting") return;

  const type = $("#edit-visit-type").value;
  const date = $("#edit-visit-date").value;
  const reason = $("#edit-visit-reason").value.trim();
  const message = $("#edit-visit-message");

  if (!type || !date) return;

  if (
    type === "consultation" &&
    !getPreviousCompletedExam(visit.patientId, date)
  ) {
    message.textContent = currentLanguage === "ar"
      ? "لا يمكن تعديل الموعد إلى استشارة من غير كشف سابق مكتمل."
      : "This visit cannot be changed to a consultation without a completed previous examination.";
    message.style.color = "#dc2626";
    return;
  }

  visit.type = type;
  visit.date = date;
  visit.reason = reason;
  const queueDateFilter = $("#queue-date-filter");
  if (queueDateFilter) queueDateFilter.value = date;

  const wasSaved = saveClinicData();
  $("#edit-visit-dialog").close();
  editingVisitId = null;

  if (!wasSaved) {
    showMessage(
      currentLanguage === "ar"
        ? "تم تعديل الموعد مؤقتاً، لكن تعذر حفظه على هذا الجهاز."
        : "Visit was edited for this session, but could not be saved on this device.",
      true
    );
  }

  renderPatients();
  renderQueue();
  updateDashboard();
}


function cancelVisit(visit) {
  if (
    visit.status !== "waiting" ||
    !window.confirm(
      currentLanguage === "ar"
        ? "هل تريد حذف هذا الموعد نهائياً؟ إذا كانت دي الزيارة الوحيدة، سيتم حذف ملف المريض أيضاً."
        : "Permanently delete this visit? If it is the patient's only visit, their patient file will also be deleted."
    )
  ) {
    return;
  }

  const patientId = visit.patientId;
  queue = queue.filter((item) => item.id !== visit.id);

  if (!queue.some((item) => item.patientId === patientId)) {
    patients = patients.filter((patient) => patient.id !== patientId);
  }

  saveClinicData();
  renderPatients();
  renderQueue();
  updateDashboard();
}


function createCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value ?? "";
  return cell;
}


function getVisitTypeText(type) {
  if (type === "consultation") {
    return currentLanguage === "ar"
      ? "استشارة"
      : "Consultation";
  }

  return currentLanguage === "ar"
    ? "كشف"
    : "Examination";
}


function getStatusText(status) {
  if (status === "waiting") {
    return currentLanguage === "ar"
      ? "في الانتظار"
      : "Waiting";
  }

  if (status === "in_doctor") {
    return currentLanguage === "ar"
      ? "عند الدكتور"
      : "With doctor";
  }

  return currentLanguage === "ar"
    ? "انتهى"
    : "Completed";
}


// ========================================
// تغيير اللغة
// ========================================

function changeLanguage() {

  currentLanguage =
    currentLanguage === "ar" ? "en" : "ar";

  document.documentElement.lang = currentLanguage;

  document.documentElement.dir =
    currentLanguage === "ar" ? "rtl" : "ltr";


  document
    .querySelectorAll("[data-ar][data-en]")
    .forEach((element) => {

      element.textContent =
        element.dataset[currentLanguage];

    });


  document
    .querySelectorAll(
      "[data-ar-placeholder][data-en-placeholder]"
    )
    .forEach((element) => {

      element.placeholder =
        currentLanguage === "ar"
          ? element.dataset.arPlaceholder
          : element.dataset.enPlaceholder;

    });


  const languageButton = $("#language-btn");

  if (languageButton) {

    languageButton.textContent =
      currentLanguage === "ar"
        ? "English"
        : "العربية";

  }


  updatePageTitle();
  updateStorageStatus();
  setBackupMessage(backupStatus);
  if ($("#visit-type")?.value === "consultation") {
    checkExamEligibility();
  }
  renderPatients();
  renderQueue();
  updateDashboard();
}


// ========================================
// عنوان الصفحة
// ========================================

function updatePageTitle() {

  const title = $("#page-title");

  if (!title) return;


  const titles = {

    dashboard: {
      ar: "لوحة التحكم",
      en: "Dashboard"
    },

    patients: {
      ar: "المرضى",
      en: "Patients"
    },

    queue: {
      ar: "المواعيد والدور",
      en: "Appointments & Queue"
    }

  };


  const pageTitle =
    titles[currentPage] || titles.dashboard;


  title.textContent =
    pageTitle[currentLanguage];

  document.title = pageTitle[currentLanguage];
}


// ========================================
// التنقل بين الصفحات
// ========================================

function showPage(pageName) {

  currentPage = pageName;


  document
    .querySelectorAll("[id$='-page']")
    .forEach((page) => {

      page.classList.add("hidden");

    });


  const selectedPage =
    $(`#${pageName}-page`);


  if (selectedPage) {
    selectedPage.classList.remove("hidden");
  }


  document
    .querySelectorAll("[data-page]")
    .forEach((button) => {

      button.classList.toggle(
        "active",
        button.dataset.page === pageName
      );

    });


  updatePageTitle();


  // تحديث الصفحة عند فتحها
  if (pageName === "patients") {
    renderPatients();
  }

  if (pageName === "queue") {
    renderQueue();
  }

  updateDashboard();
}


// ========================================
// رسائل النموذج
// ========================================

function showMessage(message, isError = false) {

  const messageBox = $("#form-message");

  if (!messageBox) return;


  messageBox.textContent = message;

  messageBox.style.color =
    isError ? "#dc2626" : "#15803d";
}


// ========================================
// إضافة مريض
// ========================================

function addPatient(event) {

  event.preventDefault();


  const name =
    $("#patient-name")?.value.trim();

  const phone =
    $("#patient-phone")?.value.trim();

  const reason =
    $("#patient-reason")?.value.trim();

  const visitType =
    $("#visit-type")?.value;

  const visitDate =
    $("#visit-date")?.value;


  if (
    !name ||
    !phone ||
    !visitType ||
    !visitDate
  ) {

    showMessage(
      currentLanguage === "ar"
        ? "من فضلك املأ كل البيانات."
        : "Please fill in all fields.",
      true
    );

    return;
  }


  const existingPatient = findPatientByPhone(phone);

  if (
    existingPatient &&
    normalizeName(existingPatient.name) !== normalizeName(name)
  ) {
    showMessage(
      currentLanguage === "ar"
        ? "رقم التلفون مسجل باسم مختلف. راجع الاسم والرقم قبل الحفظ."
        : "This phone number is registered under a different name. Check the name and number before saving.",
      true
    );

    return;
  }

  if (visitType === "consultation") {
    const previousExam = existingPatient
      ? getPreviousCompletedExam(existingPatient.id, visitDate)
      : null;

    if (!previousExam) {
      showMessage(
        currentLanguage === "ar"
          ? "لا يمكن تسجيل استشارة قبل وجود كشف سابق مكتمل. سجّل الكشف وأنهِه أولاً."
          : "A consultation requires a completed previous examination. Register and complete the examination first.",
        true
      );

      checkExamEligibility();
      return;
    }
  }

  const patient = existingPatient || {
    id: createRecordId(),
    name,
    phone,
    reason,
    createdAt: new Date().toISOString()
  };


  // إنشاء الزيارة
  const visit = {

    id: createRecordId(),

    patientId: patient.id,

    reason: reason,

    type: visitType,

    date: visitDate,

    status: "waiting",

    queueNumber: nextQueueNumber++

  };


  if (!existingPatient) patients.push(patient);

  queue.push(visit);
  const queueDateFilter = $("#queue-date-filter");
  if (queueDateFilter) queueDateFilter.value = visitDate;
  const wasSaved = saveClinicData();


  // تفريغ النموذج
  $("#patient-form").reset();
  setExamCheckMessage("", "info");


  // إعادة تاريخ اليوم
  const dateInput = $("#visit-date");

  if (dateInput) {
    dateInput.value = getTodayDate();
  }


  showMessage(
    wasSaved
      ? (currentLanguage === "ar"
          ? "تم حفظ الزيارة وإضافتها إلى الدور."
          : "Visit saved and added to the queue.")
      : (currentLanguage === "ar"
          ? "تمت إضافة الزيارة مؤقتاً، لكن تعذر حفظها على الجهاز. نزّل نسخة احتياطية."
          : "Visit was added for this session, but could not be saved on this device. Download a backup."),
    !wasSaved
  );


  renderPatients();
  renderQueue();
  updateDashboard();
}


// ========================================
// عرض المرضى
// ========================================

function renderPatients() {

  // patients-table هو tbody نفسه
  const body = $("#patients-table");

  if (!body) return;


  body.replaceChildren();


  const searchText =
    ($("#search-input")?.value || "")
      .trim()
      .toLowerCase();
  const normalizedPhoneSearch = searchText.replace(/[\s()+-]/g, "");


  const filteredPatients =
    patients.filter((patient) => {

      return (
        patient.name
          .toLowerCase()
          .includes(searchText) ||

        patient.phone
          .replace(/[\s()+-]/g, "")
          .toLowerCase()
          .includes(normalizedPhoneSearch)
      );

    });


  filteredPatients.forEach((patient) => {

    const row =
      document.createElement("tr");


    // آخر زيارة للمريض
    const patientVisits =
      queue.filter(
        (visit) =>
          visit.patientId === patient.id
      );


    const lastVisit =
      patientVisits[
        patientVisits.length - 1
      ];


    const visitType =
      lastVisit
        ? getVisitTypeText(lastVisit.type)
        : "-";


    const visitDate =
      lastVisit
        ? lastVisit.date
        : "-";


    row.append(

      createCell(patient.name),

      createCell(patient.phone),

      createCell(visitType),

      createCell(visitDate)

    );


    body.appendChild(row);

  });


  // لو البحث مفيهوش نتائج
  if (filteredPatients.length === 0) {

    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");


    cell.colSpan = 4;

    cell.textContent =
      currentLanguage === "ar"
        ? "لا يوجد مرضى."
        : "No patients found.";


    row.appendChild(cell);

    body.appendChild(row);
  }
}


// ========================================
// عرض دور اليوم
// ========================================

function renderQueue() {

  // queue-table هو tbody نفسه
  const body = $("#queue-table");

  if (!body) return;


  body.replaceChildren();


  const selectedDate = $("#queue-date-filter")?.value || getTodayDate();


  // إظهار زيارات التاريخ المختار
  const todayQueue =
    queue.filter(
      (visit) =>
        visit.date === selectedDate
    );


  todayQueue.forEach((visit) => {

    const patient =
      patients.find(
        (item) =>
          item.id === visit.patientId
      );


    if (!patient) return;


    const row =
      document.createElement("tr");


    const typeText =
      getVisitTypeText(visit.type);


    // الأعمدة متوافقة مع index.html
    row.append(

      createCell(visit.queueNumber),

      createCell(patient.name),

      createCell(typeText),

      (() => {
        const statusCell = document.createElement("td");
        const statusBadge = document.createElement("span");
        statusBadge.className = "status";
        if (visit.status === "in_doctor") statusBadge.classList.add("in-doctor");
        if (visit.status === "done") statusBadge.classList.add("done");
        statusBadge.textContent = getStatusText(visit.status);
        statusCell.appendChild(statusBadge);
        return statusCell;
      })()

    );


    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "queue-actions";

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "secondary-btn";

    if (visit.status === "waiting") {
      nextButton.textContent = currentLanguage === "ar" ? "بدء الزيارة" : "Start Visit";
      nextButton.addEventListener("click", () => {
        visit.status = "in_doctor";
        saveClinicData();
        renderQueue();
        updateDashboard();
      });

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "small-btn";
      editButton.textContent = currentLanguage === "ar" ? "تعديل" : "Edit";
      editButton.addEventListener("click", () => openVisitEditor(visit));

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "small-btn cancel-btn";
      cancelButton.textContent = currentLanguage === "ar" ? "إلغاء" : "Cancel";
      cancelButton.addEventListener("click", () => cancelVisit(visit));

      actions.append(nextButton, editButton, cancelButton);
    } else if (visit.status === "in_doctor") {
      nextButton.textContent = currentLanguage === "ar" ? "إنهاء" : "Complete";
      nextButton.addEventListener("click", () => {
        visit.status = "done";
        visit.completedAt = new Date().toISOString();
        saveClinicData();
        renderQueue();
        updateDashboard();
      });
      actions.appendChild(nextButton);
    } else {
      nextButton.textContent = currentLanguage === "ar" ? "مكتمل" : "Completed";
      nextButton.disabled = true;
      actions.appendChild(nextButton);
    }

    actionCell.appendChild(actions);

    row.appendChild(actionCell);

    body.appendChild(row);

  });


  // لو مفيش زيارات في التاريخ المختار
  if (todayQueue.length === 0) {

    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");


    cell.colSpan = 5;

    cell.textContent =
      currentLanguage === "ar"
        ? "لا توجد زيارات في التاريخ المختار."
        : "No visits on the selected date.";


    row.appendChild(cell);

    body.appendChild(row);
  }
}


// ========================================
// تحديث لوحة التحكم
// ========================================

function updateDashboard() {

  const totalPatients =
    $("#total-patients");

  const waitingPatients =
    $("#waiting-patients");

  const todayCases =
    $("#today-cases");

  const consultationAlerts =
    $("#consultation-alerts");


  // إجمالي المرضى
  if (totalPatients) {

    totalPatients.textContent =
      patients.length;

  }


  // المرضى المنتظرون اليوم
  if (waitingPatients) {

    const today = getTodayDate();


    const waitingToday =
      queue.filter((visit) => {

        return (
          visit.date === today &&
          visit.status === "waiting"
        );

      }).length;


    waitingPatients.textContent =
      waitingToday;
  }

  // إجمالي زيارات اليوم بجميع حالاتها.
  if (todayCases) {
    const today = getTodayDate();
    todayCases.textContent = queue.filter((visit) => visit.date === today).length;
  }


  // تنبيهات الاستشارات
  if (consultationAlerts) {

    const today =
      new Date();

    today.setHours(0, 0, 0, 0);


    const oldConsultations =
      queue.filter((visit) => {

        if (
          visit.type !== "consultation"
        ) {
          return false;
        }


        const visitDate =
          new Date(
            `${visit.date}T00:00:00`
          );


        const daysPassed =
          (
            today.getTime() -
            visitDate.getTime()
          ) /
          (
            1000 *
            60 *
            60 *
            24
          );


        return daysPassed > 30;

      }).length;


    consultationAlerts.textContent =
      oldConsultations;
  }
}


// ========================================
// تشغيل الموقع
// ========================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadClinicData();

    // زر اللغة
    $("#language-btn")
      ?.addEventListener(
        "click",
        changeLanguage
      );


    // إضافة مريض
    $("#patient-form")
      ?.addEventListener(
        "submit",
        addPatient
      );


    $("#patient-phone")
      ?.addEventListener("input", () => {
        if ($("#visit-type")?.value === "consultation") checkExamEligibility();
      });

    $("#visit-date")
      ?.addEventListener("change", () => {
        if ($("#visit-type")?.value === "consultation") checkExamEligibility();
      });

    $("#visit-type")
      ?.addEventListener("change", () => {
        if ($("#visit-type")?.value === "consultation") checkExamEligibility();
        else setExamCheckMessage("", "info");
      });

    $("#export-data-btn")
      ?.addEventListener("click", exportClinicData);

    $("#import-data-btn")
      ?.addEventListener("click", () => $("#import-data-file")?.click());

    $("#import-data-file")
      ?.addEventListener("change", importClinicData);

    $("#edit-visit-form")
      ?.addEventListener("submit", saveEditedVisit);

    $("#close-edit-btn")
      ?.addEventListener("click", () => {
        $("#edit-visit-dialog").close();
        editingVisitId = null;
      });


    // البحث
    $("#search-input")
      ?.addEventListener(
        "input",
        renderPatients
      );


    // تحديث دور اليوم
    $("#refresh-btn")
      ?.addEventListener(
        "click",
        () => {

          renderPatients();

          renderQueue();

          updateDashboard();

        }
      );


    // القائمة الجانبية
    document
      .querySelectorAll("[data-page]")
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => {

            showPage(
              button.dataset.page
            );

          }
        );

      });


    // الإجراءات السريعة
    document
      .querySelectorAll("[data-go]")
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => {

            showPage(
              button.dataset.go
            );

          }
        );

      });


    // تاريخ اليوم افتراضيًا في نموذج الزيارة والتقويم
    const dateInput =
      $("#visit-date");


    if (
      dateInput &&
      !dateInput.value
    ) {

      dateInput.value =
        getTodayDate();

    }

    const queueDateFilter = $("#queue-date-filter");
    if (queueDateFilter && !queueDateFilter.value) {
      queueDateFilter.value = getTodayDate();
    }

    queueDateFilter?.addEventListener("change", renderQueue);


    updatePageTitle();

    renderPatients();

    renderQueue();

    updateDashboard();

  }
);
