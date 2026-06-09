import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ReminderWindow from "./components/ReminderWindow";
import "./styles.css";

const isReminderWindow =
  new URLSearchParams(window.location.search).get("window") === "reminder";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isReminderWindow ? <ReminderWindow /> : <App />}
  </React.StrictMode>,
);
