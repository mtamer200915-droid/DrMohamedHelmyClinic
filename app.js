const $ = (selector) => document.querySelector(selector);

let currentLanguage = "ar";
let currentPage = "dashboard";

let patients = [];
let queue = [];
let nextQueueNumber = 1;


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
      ar: "دور اليوم",
      en: "Today's Queue"
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


  // إنشاء المريض
  const patient = {

    id: Date.now(),

    name: name,

    phone: phone,

    reason: reason,

    createdAt: new Date().toISOString()

  };


  // إنشاء الزيارة
  const visit = {

    id: Date.now() + 1,

    patientId: patient.id,

    reason: reason,

    type: visitType,

    date: visitDate,

    status: "waiting",

    queueNumber: nextQueueNumber++

  };


  patients.push(patient);

  queue.push(visit);


  // تفريغ النموذج
  $("#patient-form").reset();


  // إعادة تاريخ اليوم
  const dateInput = $("#visit-date");

  if (dateInput) {
    dateInput.value = getTodayDate();
  }


  showMessage(
    currentLanguage === "ar"
      ? "تمت إضافة المريض إلى قائمة الانتظار."
      : "Patient added to the waiting queue."
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


  const today = getTodayDate();


  // إظهار زيارات اليوم فقط
  const todayQueue =
    queue.filter(
      (visit) =>
        visit.date === today
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


    // زر الإجراء
    const actionCell =
      document.createElement("td");


    const nextButton =
      document.createElement("button");


    nextButton.type = "button";

    nextButton.className = "secondary-btn";


    if (visit.status === "waiting") {

      nextButton.textContent =
        currentLanguage === "ar"
          ? "بدء الكشف"
          : "Start Visit";


      nextButton.addEventListener(
        "click",
        () => {

          visit.status = "in_doctor";

          renderQueue();

          updateDashboard();

        }
      );

    }

    else if (
      visit.status === "in_doctor"
    ) {

      nextButton.textContent =
        currentLanguage === "ar"
          ? "إنهاء"
          : "Complete";


      nextButton.addEventListener(
        "click",
        () => {

          visit.status = "done";

          renderQueue();

          updateDashboard();

        }
      );

    }

    else {

      nextButton.textContent =
        currentLanguage === "ar"
          ? "مكتمل"
          : "Completed";

      nextButton.disabled = true;

    }


    actionCell.appendChild(nextButton);

    row.appendChild(actionCell);

    body.appendChild(row);

  });


  // لو مفيش مرضى النهارده
  if (todayQueue.length === 0) {

    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");


    cell.colSpan = 5;

    cell.textContent =
      currentLanguage === "ar"
        ? "لا يوجد مرضى في دور اليوم."
        : "No patients in today's queue.";


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


    // تاريخ اليوم افتراضيًا
    const dateInput =
      $("#visit-date");


    if (
      dateInput &&
      !dateInput.value
    ) {

      dateInput.value =
        getTodayDate();

    }


    updatePageTitle();

    renderPatients();

    renderQueue();

    updateDashboard();

  }
);
