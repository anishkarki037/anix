// app.js - Client-side JavaScript for Astpoint DB Web Interface

document.addEventListener("DOMContentLoaded", () => {
  // Global variables
  let currentDB = null;
  let currentTable = null;
  let currentRecords = [];

  // API endpoints
  const API = {
    databases: "http://localhost:5431/api/databases",
    tables: (db) => `http://localhost:5431/api/databases/${db}/tables`,
    records: (db, table) =>
      `http://localhost:5431/api/databases/${db}/tables/${table}/records`,
    query: "http://localhost:5431/api/query",
  };

  // DOM elements
  const elements = {
    // Main views
    welcomeScreen: document.getElementById("welcomeScreen"),
    databaseView: document.getElementById("databaseView"),
    tableView: document.getElementById("tableView"),

    // Database elements
    databaseList: document.getElementById("databaseList"),
    currentDbName: document.getElementById("currentDbName"),
    tableList: document.getElementById("tableList"),

    // Table elements
    currentTableName: document.getElementById("currentTableName"),
    recordsTable: document.getElementById("recordsTable"),
    noRecords: document.getElementById("noRecords"),

    // Modal elements
    modalOverlay: document.getElementById("modalOverlay"),

    // Buttons
    btnNewDb: document.getElementById("btnNewDb"),
    btnRefresh: document.getElementById("btnRefresh"),
    btnCreateFirstDb: document.getElementById("btnCreateFirstDb"),
    btnNewTable: document.getElementById("btnNewTable"),
    btnNewRecord: document.getElementById("btnNewRecord"),
    btnDeleteTable: document.getElementById("btnDeleteTable"),
    backToDbBtn: document.getElementById("backToDbBtn"),

    // Query elements
    queryInput: document.getElementById("queryInput"),
    btnRunQuery: document.getElementById("btnRunQuery"),
    queryResults: document.getElementById("queryResults"),

    // Database info
    dbInfo: document.getElementById("dbInfo"),

    // Search
    recordSearch: document.getElementById("recordSearch"),
    btnSearch: document.getElementById("btnSearch"),
  };

  // Modal buttons
  const modals = {
    newDbModal: {
      modal: document.getElementById("newDbModal"),
      createBtn: document.getElementById("createDbBtn"),
      nameInput: document.getElementById("newDbName"),
    },
    newTableModal: {
      modal: document.getElementById("newTableModal"),
      createBtn: document.getElementById("createTableBtn"),
      nameInput: document.getElementById("newTableName"),
      recordInput: document.getElementById("initialRecord"),
    },
    newRecordModal: {
      modal: document.getElementById("newRecordModal"),
      addBtn: document.getElementById("addRecordBtn"),
      dataInput: document.getElementById("newRecordData"),
    },
    editRecordModal: {
      modal: document.getElementById("editRecordModal"),
      updateBtn: document.getElementById("updateRecordBtn"),
      deleteBtn: document.getElementById("deleteRecordBtn"),
      dataInput: document.getElementById("editRecordData"),
      indexInput: document.getElementById("editRecordIndex"),
    },
    confirmModal: {
      modal: document.getElementById("confirmModal"),
      confirmBtn: document.getElementById("confirmBtn"),
      title: document.getElementById("confirmTitle"),
      message: document.getElementById("confirmMessage"),
    },
  };

  // Tab buttons
  const tabs = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  // Event listeners

  // Tab navigation
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabId = tab.getAttribute("data-tab");

      // Update active tab button
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Show selected tab content
      tabContents.forEach((content) => {
        content.classList.remove("active");
        if (content.id === `${tabId}Tab`) {
          content.classList.add("active");
        }
      });
    });
  });

  // Close modal buttons
  document.querySelectorAll(".close-modal, .btn-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalId = btn.getAttribute("data-modal");
      if (modalId) {
        toggleModal(modalId, false);
      }
    });
  });

  // Database operations
  elements.btnNewDb.addEventListener("click", () => {
    modals.newDbModal.nameInput.value = "";
    toggleModal("newDbModal", true);
    setTimeout(() => modals.newDbModal.nameInput.focus(), 100);
  });

  elements.btnRefresh.addEventListener("click", loadDatabases);
  elements.btnCreateFirstDb.addEventListener("click", () =>
    elements.btnNewDb.click()
  );

  modals.newDbModal.createBtn.addEventListener("click", createDatabase);

  // Table operations
  elements.btnNewTable.addEventListener("click", () => {
    modals.newTableModal.nameInput.value = "";
    modals.newTableModal.recordInput.value =
      '{\n  "id": 1,\n  "name": "Example",\n  "created": "' +
      new Date().toISOString() +
      '"\n}';
    toggleModal("newTableModal", true);
    setTimeout(() => modals.newTableModal.nameInput.focus(), 100);
  });

  modals.newTableModal.createBtn.addEventListener("click", createTable);
  elements.btnDeleteTable.addEventListener("click", confirmDeleteTable);
  elements.backToDbBtn.addEventListener("click", () => {
    showView("databaseView");
    loadTables(currentDB);
  });

  // Record operations
  elements.btnNewRecord.addEventListener("click", () => {
    // Prepare new record form with schema from existing records
    let schema = "{\n";

    if (currentRecords.length > 0) {
      const sampleRecord = currentRecords[0];
      Object.keys(sampleRecord).forEach((key, index, arr) => {
        let value = "";
        if (typeof sampleRecord[key] === "number") {
          value = 0;
        } else if (typeof sampleRecord[key] === "boolean") {
          value = false;
        } else if (
          typeof sampleRecord[key] === "object" &&
          sampleRecord[key] !== null
        ) {
          value = "{}";
        } else {
          value = '""';
        }

        schema += `  "${key}": ${value}`;
        if (index < arr.length - 1) {
          schema += ",\n";
        } else {
          schema += "\n";
        }
      });
    } else {
      schema +=
        '  "id": 1,\n  "name": "New Record",\n  "created": "' +
        new Date().toISOString() +
        '"\n';
    }

    schema += "}";
    modals.newRecordModal.dataInput.value = schema;
    toggleModal("newRecordModal", true);
    setTimeout(() => modals.newRecordModal.dataInput.focus(), 100);
  });

  modals.newRecordModal.addBtn.addEventListener("click", addRecord);
  modals.editRecordModal.updateBtn.addEventListener("click", updateRecord);
  modals.editRecordModal.deleteBtn.addEventListener("click", deleteRecord);

  // Query operations
  elements.btnRunQuery.addEventListener("click", executeQuery);

  // Search records
  elements.recordSearch.addEventListener("input", filterRecords);
  elements.btnSearch.addEventListener("click", filterRecords);

  // Initialize application
  init();

  // Functions

  function init() {
    loadDatabases();

    // Enter key in modal inputs
    modals.newDbModal.nameInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        createDatabase();
      }
    });

    modals.newTableModal.nameInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        createTable();
      }
    });

    // Setup modal overlay
    elements.modalOverlay.addEventListener("click", (e) => {
      if (e.target === elements.modalOverlay) {
        closeAllModals();
      }
    });
  }

  function loadDatabases() {
    elements.databaseList.innerHTML = '<div class="loading">Loading...</div>';

    fetch(API.databases)
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          renderDatabases(data.databases);
        } else {
          showError(data.error || "Failed to load databases");
        }
      })
      .catch((error) => {
        showError("Error loading databases: " + error.message);
      });
  }

  function renderDatabases(databases) {
    if (databases.length === 0) {
      elements.databaseList.innerHTML =
        '<div class="empty-list">No databases found</div>';
      showView("welcomeScreen");
      return;
    }

    elements.databaseList.innerHTML = "";

    databases.forEach((db) => {
      const dbItem = document.createElement("div");
      dbItem.classList.add("database-item");
      dbItem.innerHTML = `
        <div class="db-info">
          <div class="db-name">${db.name}</div>
          <div class="db-meta">
            <span>${formatSize(db.size)}</span> • 
            <span>${formatDate(db.modified)}</span>
          </div>
        </div>
        <div class="db-actions">
          <button class="action-btn btn-delete" title="Delete Database">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;

      // Select database
      dbItem.querySelector(".db-info").addEventListener("click", () => {
        selectDatabase(db.name);
      });

      // Delete database
      dbItem.querySelector(".btn-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        confirmDeleteDatabase(db.name);
      });

      elements.databaseList.appendChild(dbItem);
    });
  }

  function selectDatabase(dbName) {
    currentDB = dbName;
    elements.currentDbName.textContent = dbName;
    loadTables(dbName);
    showView("databaseView");

    // Load DB info
    loadDbInfo(dbName);
  }

  function loadTables(dbName) {
    elements.tableList.innerHTML =
      '<div class="loading">Loading tables...</div>';

    fetch(API.tables(dbName))
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          renderTables(data.tables);
        } else {
          elements.tableList.innerHTML = `<div class="error">${
            data.error || "Failed to load tables"
          }</div>`;
        }
      })
      .catch((error) => {
        elements.tableList.innerHTML = `<div class="error">Error loading tables: ${error.message}</div>`;
      });
  }

  function renderTables(tables) {
    if (tables.length === 0) {
      elements.tableList.innerHTML = `
        <div class="empty-list">
          <p>No tables found</p>
          <p>Create a new table to get started</p>
        </div>
      `;
      return;
    }

    elements.tableList.innerHTML = "";

    tables.forEach((table) => {
      const tableItem = document.createElement("div");
      tableItem.classList.add("table-item");
      tableItem.innerHTML = `
        <div class="table-info">
          <div class="table-name">${table.name}</div>
          <div class="table-meta">
            <span>${table.count} record${table.count !== 1 ? "s" : ""}</span>
          </div>
        </div>
      `;

      tableItem.addEventListener("click", () => {
        selectTable(table.name);
      });

      elements.tableList.appendChild(tableItem);
    });
  }

  function selectTable(tableName) {
    currentTable = tableName;
    elements.currentTableName.textContent = tableName;
    loadRecords(currentDB, tableName);
    showView("tableView");
  }

  function loadRecords(dbName, tableName) {
    fetch(API.records(dbName, tableName))
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          currentRecords = data.records;
          renderRecords(data.records);
        } else {
          showError(data.error || "Failed to load records");
        }
      })
      .catch((error) => {
        showError("Error loading records: " + error.message);
      });
  }

  function renderRecords(records) {
    if (records.length === 0) {
      elements.recordsTable.classList.add("hidden");
      elements.noRecords.classList.remove("hidden");
      return;
    }

    elements.recordsTable.classList.remove("hidden");
    elements.noRecords.classList.add("hidden");

    // Create header row
    const headers = Object.keys(records[0]);
    const headerRow = document.createElement("tr");

    headers.forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      headerRow.appendChild(th);
    });

    // Add action column
    const actionHeader = document.createElement("th");
    actionHeader.textContent = "Actions";
    actionHeader.classList.add("action-column");
    headerRow.appendChild(actionHeader);

    elements.recordsTable.querySelector("thead").innerHTML = "";
    elements.recordsTable.querySelector("thead").appendChild(headerRow);

    // Create data rows
    const tbody = elements.recordsTable.querySelector("tbody");
    tbody.innerHTML = "";

    records.forEach((record, index) => {
      const row = document.createElement("tr");

      headers.forEach((header) => {
        const td = document.createElement("td");
        const value = record[header];

        if (value === null || value === undefined) {
          td.textContent = "-";
          td.classList.add("null-value");
        } else if (typeof value === "object") {
          td.textContent = JSON.stringify(value);
          td.title = JSON.stringify(value, null, 2);
          td.classList.add("object-value");
        } else {
          td.textContent = value.toString();
        }

        row.appendChild(td);
      });

      // Add action buttons
      const actionCell = document.createElement("td");
      actionCell.classList.add("action-cell");

      const editButton = document.createElement("button");
      editButton.classList.add("action-btn");
      editButton.innerHTML = '<i class="fas fa-edit"></i>';
      editButton.title = "Edit Record";
      editButton.addEventListener("click", () => {
        editRecord(index);
      });

      actionCell.appendChild(editButton);
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });
  }

  function editRecord(index) {
    const record = currentRecords[index];
    modals.editRecordModal.dataInput.value = JSON.stringify(record, null, 2);
    modals.editRecordModal.indexInput.value = index;
    toggleModal("editRecordModal", true);
    setTimeout(() => modals.editRecordModal.dataInput.focus(), 100);
  }

  function addRecord() {
    try {
      const recordData = JSON.parse(modals.newRecordModal.dataInput.value);

      fetch(API.records(currentDB, currentTable), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ record: recordData }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showNotification("Record added successfully");
            toggleModal("newRecordModal", false);
            loadRecords(currentDB, currentTable);
          } else {
            showError(data.error || "Failed to add record");
          }
        })
        .catch((error) => {
          showError("Error adding record: " + error.message);
        });
    } catch (error) {
      showError("Invalid JSON: " + error.message);
    }
  }

  function updateRecord() {
    try {
      const recordData = JSON.parse(modals.editRecordModal.dataInput.value);
      const index = parseInt(modals.editRecordModal.indexInput.value);
      const oldRecord = currentRecords[index];

      // Create a filter for the exact record
      const filter = {};

      // Try to find a unique identifier for the record
      if (oldRecord.id !== undefined) {
        filter.id = oldRecord.id;
      } else if (oldRecord._id !== undefined) {
        filter._id = oldRecord._id;
      } else {
        // If no unique ID, use all fields as filter (not ideal)
        Object.assign(filter, oldRecord);
      }

      fetch(API.records(currentDB, currentTable), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: filter,
          updates: recordData,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showNotification(`Record updated successfully`);
            toggleModal("editRecordModal", false);
            loadRecords(currentDB, currentTable);
          } else {
            showError(data.error || "Failed to update record");
          }
        })
        .catch((error) => {
          showError("Error updating record: " + error.message);
        });
    } catch (error) {
      showError("Invalid JSON: " + error.message);
    }
  }

  function deleteRecord() {
    try {
      const index = parseInt(modals.editRecordModal.indexInput.value);
      const record = currentRecords[index];

      // Create a filter for the exact record
      const filter = {};

      // Try to find a unique identifier for the record
      if (record.id !== undefined) {
        filter.id = record.id;
      } else if (record._id !== undefined) {
        filter._id = record._id;
      } else {
        // If no unique ID, use all fields as filter (not ideal)
        Object.assign(filter, record);
      }

      fetch(API.records(currentDB, currentTable), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(filter),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showNotification(`Record deleted successfully`);
            toggleModal("editRecordModal", false);
            loadRecords(currentDB, currentTable);
          } else {
            showError(data.error || "Failed to delete record");
          }
        })
        .catch((error) => {
          showError("Error deleting record: " + error.message);
        });
    } catch (error) {
      showError("Error: " + error.message);
    }
  }

  function createDatabase() {
    const dbName = modals.newDbModal.nameInput.value.trim();

    if (!dbName) {
      showError("Database name is required");
      return;
    }

    fetch(API.databases, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: dbName }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          showNotification("Database created successfully");
          toggleModal("newDbModal", false);
          loadDatabases();

          // Automatically select the new database
          setTimeout(() => {
            selectDatabase(data.database.name);
          }, 500);
        } else {
          showError(data.error || "Failed to create database");
        }
      })
      .catch((error) => {
        showError("Error creating database: " + error.message);
      });
  }

  function createTable() {
    const tableName = modals.newTableModal.nameInput.value.trim();
    const recordJson = modals.newTableModal.recordInput.value.trim();

    if (!tableName) {
      showError("Table name is required");
      return;
    }

    try {
      const record = JSON.parse(recordJson);

      fetch(API.tables(currentDB), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tableName, record }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            showNotification("Table created successfully");
            toggleModal("newTableModal", false);
            loadTables(currentDB);

            // Automatically select the new table
            setTimeout(() => {
              selectTable(data.table.name);
            }, 500);
          } else {
            showError(data.error || "Failed to create table");
          }
        })
        .catch((error) => {
          showError("Error creating table: " + error.message);
        });
    } catch (error) {
      showError("Invalid JSON: " + error.message);
    }
  }

  function confirmDeleteDatabase(dbName) {
    modals.confirmModal.title.textContent = "Delete Database";
    modals.confirmModal.message.textContent = `Are you sure you want to delete the database "${dbName}"? This action cannot be undone.`;

    modals.confirmModal.confirmBtn.onclick = () => {
      deleteDatabase(dbName);
      toggleModal("confirmModal", false);
    };

    toggleModal("confirmModal", true);
  }

  function deleteDatabase(dbName) {
    fetch(`${API.databases}/${dbName}`, {
      method: "DELETE",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          showNotification("Database deleted successfully");

          // If the current database was deleted, go back to welcome screen
          if (currentDB === dbName) {
            showView("welcomeScreen");
            currentDB = null;
          }

          loadDatabases();
        } else {
          showError(data.error || "Failed to delete database");
        }
      })
      .catch((error) => {
        showError("Error deleting database: " + error.message);
      });
  }

  function confirmDeleteTable() {
    modals.confirmModal.title.textContent = "Delete Table";
    modals.confirmModal.message.textContent = `Are you sure you want to delete the table "${currentTable}"? This action cannot be undone.`;

    modals.confirmModal.confirmBtn.onclick = () => {
      deleteTable();
      toggleModal("confirmModal", false);
    };

    toggleModal("confirmModal", true);
  }

  function deleteTable() {
    fetch(`${API.tables(currentDB)}/${currentTable}`, {
      method: "DELETE",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          showNotification("Table deleted successfully");
          showView("databaseView");
          loadTables(currentDB);
        } else {
          showError(data.error || "Failed to delete table");
        }
      })
      .catch((error) => {
        showError("Error deleting table: " + error.message);
      });
  }

  function executeQuery() {
    const query = elements.queryInput.value.trim();

    if (!query) {
      elements.queryResults.innerHTML =
        '<div class="error">Please enter a query</div>';
      return;
    }

    elements.queryResults.innerHTML =
      '<div class="loading">Executing query...</div>';

    fetch(API.query, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: currentDB,
        query: query,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          displayQueryResults(data.result);
        } else {
          elements.queryResults.innerHTML = `<div class="error">${
            data.error || "Error executing query"
          }</div>`;
        }
      })
      .catch((error) => {
        elements.queryResults.innerHTML = `<div class="error">Error: ${error.message}</div>`;
      });
  }

  function displayQueryResults(result) {
    elements.queryResults.innerHTML = "";

    if (!result || (Array.isArray(result) && result.length === 0)) {
      elements.queryResults.innerHTML =
        '<div class="info">No results returned</div>';
      return;
    }

    if (typeof result === "string") {
      elements.queryResults.innerHTML = `<div class="info">${result}</div>`;
      return;
    }

    if (typeof result === "object" && !Array.isArray(result)) {
      const resultDiv = document.createElement("div");
      resultDiv.classList.add("json-result");
      resultDiv.innerHTML =
        "<pre>" + syntaxHighlight(JSON.stringify(result, null, 2)) + "</pre>";
      elements.queryResults.appendChild(resultDiv);
      return;
    }

    // Handle array results
    if (Array.isArray(result)) {
      if (typeof result[0] === "object") {
        // Render table for array of objects
        const table = document.createElement("table");
        table.classList.add("results-table");

        // Create header
        const headers = Object.keys(result[0]);
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        headers.forEach((header) => {
          const th = document.createElement("th");
          th.textContent = header;
          headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body
        const tbody = document.createElement("tbody");

        result.forEach((item) => {
          const row = document.createElement("tr");

          headers.forEach((header) => {
            const td = document.createElement("td");
            const value = item[header];

            if (value === null || value === undefined) {
              td.textContent = "-";
              td.classList.add("null-value");
            } else if (typeof value === "object") {
              td.textContent = JSON.stringify(value);
              td.title = JSON.stringify(value, null, 2);
              td.classList.add("object-value");
            } else {
              td.textContent = value.toString();
            }

            row.appendChild(td);
          });

          tbody.appendChild(row);
        });

        table.appendChild(tbody);
        elements.queryResults.appendChild(table);

        // Add count info
        const countInfo = document.createElement("div");
        countInfo.classList.add("count-info");
        countInfo.textContent = `${result.length} record${
          result.length !== 1 ? "s" : ""
        } found`;
        elements.queryResults.appendChild(countInfo);
      } else {
        // Simple array of values
        const list = document.createElement("ul");
        list.classList.add("results-list");

        result.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = item;
          list.appendChild(li);
        });

        elements.queryResults.appendChild(list);
      }
    }
  }

  function loadDbInfo(dbName) {
    fetch(`${API.databases}/${dbName}/tables`)
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          const tables = data.tables;
          let totalRecords = 0;

          tables.forEach((table) => {
            totalRecords += table.count;
          });

          elements.dbInfo.innerHTML = `
            <div class="info-group">
              <div class="info-label">Database Name</div>
              <div class="info-value">${dbName}</div>
            </div>
            <div class="info-group">
              <div class="info-label">Number of Tables</div>
              <div class="info-value">${tables.length}</div>
            </div>
            <div class="info-group">
              <div class="info-label">Total Records</div>
              <div class="info-value">${totalRecords}</div>
            </div>
            <div class="info-group">
              <div class="info-label">Tables</div>
              <div class="info-value">
                <ul class="info-list">
                  ${tables
                    .map(
                      (table) =>
                        `<li>${table.name} (${table.count} record${
                          table.count !== 1 ? "s" : ""
                        })</li>`
                    )
                    .join("")}
                </ul>
              </div>
            </div>
          `;
        }
      })
      .catch((error) => {
        elements.dbInfo.innerHTML = `<div class="error">Error loading database info: ${error.message}</div>`;
      });
  }

  function filterRecords() {
    const searchTerm = elements.recordSearch.value.toLowerCase();

    if (!searchTerm) {
      renderRecords(currentRecords);
      return;
    }

    const filteredRecords = currentRecords.filter((record) => {
      return Object.values(record).some((value) => {
        if (value === null || value === undefined) {
          return false;
        }

        if (typeof value === "object") {
          return JSON.stringify(value).toLowerCase().includes(searchTerm);
        }

        return value.toString().toLowerCase().includes(searchTerm);
      });
    });

    renderRecords(filteredRecords);
  }

  // Utility functions

  function showView(viewName) {
    // Hide all views
    elements.welcomeScreen.classList.add("hidden");
    elements.databaseView.classList.add("hidden");
    elements.tableView.classList.add("hidden");

    // Show requested view
    switch (viewName) {
      case "welcomeScreen":
        elements.welcomeScreen.classList.remove("hidden");
        break;
      case "databaseView":
        elements.databaseView.classList.remove("hidden");
        break;
      case "tableView":
        elements.tableView.classList.remove("hidden");
        break;
    }
  }

  function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);

    if (show) {
      modal.classList.remove("hidden");
      elements.modalOverlay.classList.remove("hidden");
    } else {
      modal.classList.add("hidden");
      elements.modalOverlay.classList.add("hidden");
    }
  }

  function closeAllModals() {
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.classList.add("hidden");
    });
    elements.modalOverlay.classList.add("hidden");
  }

  function formatSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  }

  function showNotification(message) {
    const notification = document.createElement("div");
    notification.classList.add("notification");
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add("show");
    }, 10);

    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }

  function showError(message) {
    const errorNotification = document.createElement("div");
    errorNotification.classList.add("notification", "error");
    errorNotification.textContent = message;

    document.body.appendChild(errorNotification);

    setTimeout(() => {
      errorNotification.classList.add("show");
    }, 10);

    setTimeout(() => {
      errorNotification.classList.remove("show");
      setTimeout(() => {
        errorNotification.remove();
      }, 300);
    }, 5000);
  }

  function syntaxHighlight(json) {
    json = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function (match) {
        let cls = "json-number";
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = "json-key";
          } else {
            cls = "json-string";
          }
        } else if (/true|false/.test(match)) {
          cls = "json-boolean";
        } else if (/null/.test(match)) {
          cls = "json-null";
        }
        return '<span class="' + cls + '">' + match + "</span>";
      }
    );
  }
});
