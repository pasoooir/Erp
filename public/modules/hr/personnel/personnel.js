const statusLabels = { active: "فعال", leave: "مرخصی", terminated: "خاتمه همکاری", draft: "پیش‌نویس", expired: "منقضی" };
const $ = id => document.getElementById(id);
const formValues = form => Object.fromEntries(new FormData(form).entries());

export function initializePersonnelModule({ api, notice, getUser }) {
  const employeeForm = $("hrEmployeeForm");
  const contractForm = $("hrContractForm");
  let employees = [];
  let units = [];
  let selectedEmployee = null;

  function fillOrganizationSelects() {
    const orgSelect = employeeForm.elements.org_unit_id;
    const previousOrg = orgSelect.value;
    orgSelect.replaceChildren(new Option("انتخاب واحد", ""));
    units.filter(unit => ["site", "department"].includes(unit.unit_type) && unit.status === "active")
      .forEach(unit => orgSelect.add(new Option(unit.code + " — " + unit.name, unit.id)));
    if (units.some(unit => unit.id === previousOrg)) orgSelect.value = previousOrg;
    fillPositions();
  }

  function fillPositions() {
    const orgId = employeeForm.elements.org_unit_id.value;
    const select = employeeForm.elements.position_unit_id;
    const previous = select.value;
    select.replaceChildren(new Option("بدون سمت", ""));
    units.filter(unit => unit.unit_type === "position" && unit.status === "active" && unit.parent_id === orgId)
      .forEach(unit => select.add(new Option(unit.code + " — " + unit.name, unit.id)));
    if (Array.from(select.options).some(option => option.value === previous)) select.value = previous;
  }

  function renderEmployees() {
    $("hrEmployeeCount").textContent = new Intl.NumberFormat("fa-IR").format(employees.length);
    $("hrEmployeesLoading").classList.add("hidden");
    $("hrEmployeesEmpty").classList.toggle("hidden", employees.length > 0);
    const body = $("hrEmployeesTable");
    body.replaceChildren();
    for (const employee of employees) {
      const row = document.createElement("tr");
      const values = [
        employee.employee_no, employee.display_name, employee.org_unit_name,
        employee.position_name || "—", statusLabels[employee.employment_status] || employee.employment_status,
        employee.hired_on, String(employee.contract_count ?? 0)
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }
      const actions = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button small";
      button.dataset.action = "contracts";
      button.dataset.id = employee.id;
      button.textContent = "قراردادها";
      actions.appendChild(button);
      row.appendChild(actions);
      body.appendChild(row);
    }
  }

  async function loadEmployees() {
    $("hrEmployeesLoading").classList.remove("hidden");
    try {
      const response = await api("/api/v1/hr/employees?limit=100&offset=0", {}, true);
      employees = response.data || [];
      renderEmployees();
    } catch (error) {
      $("hrEmployeesLoading").classList.add("hidden");
      notice(error.message, "error");
    }
  }

  async function loadContracts(employeeId) {
    const response = await api("/api/v1/hr/contracts?employee_id=" + encodeURIComponent(employeeId) + "&limit=100&offset=0", {}, true);
    const contracts = response.data || [];
    const body = $("hrContractsTable");
    body.replaceChildren();
    $("hrContractsEmpty").classList.toggle("hidden", contracts.length > 0);
    for (const contract of contracts) {
      const row = document.createElement("tr");
      for (const value of [
        contract.contract_no, contract.contract_type, contract.start_date,
        contract.end_date || "—", contract.signed_on || "—",
        statusLabels[contract.status] || contract.status
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
  }

  async function selectEmployee(employee) {
    selectedEmployee = employee;
    $("hrContractsPanel").classList.remove("hidden");
    $("hrSelectedEmployee").textContent = employee.employee_no + " — " + employee.display_name;
    contractForm.elements.employee_id.value = employee.id;
    await loadContracts(employee.id);
  }

  employeeForm.elements.org_unit_id.addEventListener("change", fillPositions);
  employeeForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = employeeForm.querySelector('button[type="submit"]');
    button.disabled = true;
    const data = formValues(employeeForm);
    if (!data.work_email) data.work_email = null;
    if (!data.position_unit_id) data.position_unit_id = null;
    try {
      await api("/api/v1/hr/employees", { method: "POST", body: JSON.stringify(data) });
      employeeForm.reset();
      fillOrganizationSelects();
      notice("پرونده پرسنلی ثبت شد و رویداد ممیزی ذخیره شد.", "success");
      await loadEmployees();
    } catch (error) {
      notice(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  $("hrEmployeesTable").addEventListener("click", async event => {
    const button = event.target.closest("button[data-action='contracts']");
    if (!button) return;
    const employee = employees.find(item => item.id === button.dataset.id);
    if (!employee) return;
    try { await selectEmployee(employee); }
    catch (error) { notice(error.message, "error"); }
  });

  contractForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!selectedEmployee) {
      notice("ابتدا یک کارمند را از فهرست انتخاب کنید.", "error");
      return;
    }
    const button = contractForm.querySelector('button[type="submit"]');
    button.disabled = true;
    const data = formValues(contractForm);
    if (!data.end_date) data.end_date = null;
    if (!data.signed_on) data.signed_on = null;
    try {
      await api("/api/v1/hr/contracts", { method: "POST", body: JSON.stringify(data) });
      contractForm.elements.contract_no.value = "";
      contractForm.elements.contract_type.value = "";
      contractForm.elements.start_date.value = "";
      contractForm.elements.end_date.value = "";
      contractForm.elements.signed_on.value = "";
      contractForm.elements.status.value = "draft";
      notice("قرارداد ثبت شد و رویداد ممیزی ذخیره شد.", "success");
      await loadContracts(selectedEmployee.id);
      await loadEmployees();
    } catch (error) {
      notice(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  async function load() {
    const roles = getUser()?.roles || [];
    const allowed = roles.includes("admin") || roles.includes("org_manager");
    $("hrPersonnelPanel").classList.toggle("hidden", !allowed);
    if (!allowed) return;
    try {
      units = await api("/api/v1/org-units");
      fillOrganizationSelects();
      await loadEmployees();
    } catch (error) {
      notice(error.message, "error");
    }
  }

  return { load };
}
