import { useState, useEffect } from "react";
import "./App.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingChanges, setPendingChanges] = useState({});

  // Check login status on page load
useEffect(() => {
  fetch(`${API_BASE}/status`, { credentials: "include" })
    .then((res) => res.json())
    .then((data) => {
      setLoggedIn(data.loggedIn);
      if (data.loggedIn) {
        fetch(`${API_BASE}/user-info`, { credentials: "include" })
          .then((res) => res.json())
          .then((info) => setUserInfo(info));
      }
    })
    .catch(() => setLoggedIn(false));
}, []);

  const login = () => {
    window.location.href = `${API_BASE}/login`;
  };

  const fetchRules = async () => {
    setLoading(true);
    setMessage("");
    setPendingChanges({});
    try {
      const res = await fetch(`${API_BASE}/validation-rules`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.error) {
        setMessage("Error: " + data.error);
      } else {
        setRules(data);
      }
    } catch (err) {
      setMessage("Failed to fetch rules: " + err.message);
    }
    setLoading(false);
  };

  // Local toggle only — marks as pending, does NOT call Salesforce yet
  const toggleRule = (id, currentActive) => {
    setRules((prev) =>
      prev.map((r) => (r.Id === id ? { ...r, Active: !currentActive } : r))
    );
    setPendingChanges((prev) => ({ ...prev, [id]: !currentActive }));
    setMessage("⚠️ Change pending — click 'Deploy Changes' to save to Salesforce");
  };

  // Local bulk toggle — marks all as pending
  const toggleAll = (setActive) => {
    setRules((prev) => prev.map((r) => ({ ...r, Active: setActive })));
    const changes = {};
    rules.forEach((r) => {
      changes[r.Id] = setActive;
    });
    setPendingChanges((prev) => ({ ...prev, ...changes }));
    setMessage("⚠️ Bulk change pending — click 'Deploy Changes' to save to Salesforce");
  };

  // Sends all pending changes to Salesforce
  const deployChanges = async () => {
    const ids = Object.keys(pendingChanges);
    if (ids.length === 0) {
      setMessage("No pending changes to deploy.");
      return;
    }
    setLoading(true);
    try {
      for (const id of ids) {
        await fetch(`${API_BASE}/validation-rules/${id}/toggle`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: pendingChanges[id] }),
        });
      }
      setPendingChanges({});
      setMessage(`✅ Deployed ${ids.length} change(s) to Salesforce successfully!`);
    } catch (err) {
      setMessage("Deploy failed: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="container" style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>CloudVandana Salesforce Assignment</h1>

      {!loggedIn ? (
        <button onClick={login}>Login with Salesforce</button>
      ) : (
        <>
          <p style={{ color: "green" }}>✅ Logged in to Salesforce</p>
          {userInfo && (
  <p style={{ fontSize: "14px", color: "#555" }}>
    👤 {userInfo.username} &nbsp;|&nbsp; 🏢 Org ID: {userInfo.organizationId}
  </p>
)}

          <button onClick={fetchRules} disabled={loading}>
            {loading ? "Loading..." : "Get Validation Rules"}
          </button>

          {rules.length > 0 && (
            <>
              <button
                onClick={() => toggleAll(true)}
                disabled={loading}
                style={{ marginLeft: "10px" }}
              >
                Activate All
              </button>
              <button
                onClick={() => toggleAll(false)}
                disabled={loading}
                style={{ marginLeft: "10px" }}
              >
                Deactivate All
              </button>
              <button
                onClick={deployChanges}
                disabled={loading || Object.keys(pendingChanges).length === 0}
                style={{ marginLeft: "10px", background: "green", color: "white" }}
              >
                Deploy Changes ({Object.keys(pendingChanges).length})
              </button>
            </>
          )}

          {message && <p>{message}</p>}

          {rules.length > 0 && (
            <table
              border="1"
              cellPadding="10"
              style={{ marginTop: "20px", borderCollapse: "collapse", width: "100%" }}
            >
              <thead>
                <tr>
                  <th>Rule Name</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.Id}>
                    <td>{rule.ValidationName}</td>
                    <td>{rule.Active ? "🟢 Active" : "🔴 Inactive"}</td>
                    <td>
                      <button onClick={() => toggleRule(rule.Id, rule.Active)}>
                        {rule.Active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default App;