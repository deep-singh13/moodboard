import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// A quiet hello for the curious. (DevTools openers, this one's for you.)
if (typeof window !== "undefined" && !import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log(
    "%cMoodboard %c— made for things worth remembering.",
    "font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: 22px; color: #D4A574;",
    "font-family: 'DM Sans', sans-serif; font-size: 12px; color: #7A7A78;",
  );
}

createRoot(document.getElementById("root")!).render(<App />);
