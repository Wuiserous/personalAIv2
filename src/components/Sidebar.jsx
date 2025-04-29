import React, { useState, useEffect } from 'react'; // Import useEffect
import { TbLayoutSidebarRightCollapseFilled } from "react-icons/tb";
// import { TbLayoutSidebarRightExpandFilled } from "react-icons/tb"; // Not used in the provided code
// import { TbLayoutSidebarLeftExpandFilled } from "react-icons/tb"; // Not used in the provided code
import { TbLayoutSidebarLeftCollapseFilled } from "react-icons/tb";

// --- Define backend URL outside the component ---
const backendUrl = 'http://localhost:8000'; // Your FastAPI backend URL

// --- Define the notification function outside the component ---
// It doesn't depend on component state, so it can be standalone.
function notifyBackend(endpoint) {
  console.log(`Notifying backend: ${endpoint}`);
  fetch(`${backendUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Add any other necessary headers, like authentication if needed
    },
    body: JSON.stringify({}) // Send an empty body if no data is needed
  })
  .then(response => {
    // Check if response is ok, but don't error if it fails silently
    // The blob centering is nice-to-have, app should function without it
    if (!response.ok) {
      console.warn(`Could not notify backend at ${endpoint}: ${response.statusText}`);
    } else {
      console.log(`Successfully called ${endpoint}`);
      // Optionally process response data if needed
      // return response.json().then(data => console.log('Response from backend:', data));
    }
  })
  .catch(error => {
    // Log fetch errors, but don't crash the app
    console.error(`Fetch error for ${endpoint}:`, error);
  });
}


export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [openSection, setOpenSection] = useState('');

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? '' : section);
  };

  // --- Add useEffect Hook for Focus/Blur/Visibility ---
  useEffect(() => {
    // --- Define Listener Callbacks ---
    // Using named functions makes removing listeners easier and cleaner
    const handleFocus = () => {
      console.log('Window gained focus.');
      notifyBackend('/api/webpage/focused');
    };

    const handleBlur = () => {
      console.log('Window lost focus.');
      notifyBackend('/api/webpage/blurred');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab became visible.');
        notifyBackend('/api/webpage/focused');
      } else {
        console.log('Tab became hidden.');
        notifyBackend('/api/webpage/blurred');
      }
    };

    // --- Attach Event Listeners ---
    console.log('Attaching focus/blur/visibility listeners');
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // --- Initial Check on Mount ---
    // Important: Check if the page is already visible when the component mounts
    if (document.visibilityState === 'visible') {
        console.log('Component mounted visible.');
        handleFocus(); // Trigger the focus notification immediately
    }

    // --- Cleanup Function ---
    // This function runs when the component unmounts
    return () => {
      console.log('Removing focus/blur/visibility listeners');
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // **Crucial:** Notify the backend that the page is blurred when the component
      // unmounts (e.g., user navigates away in SPA or closes tab)
      console.log('Component unmounting, sending blurred signal.');
      notifyBackend('/api/webpage/blurred');
    };
  }, []); // Empty dependency array [] means:
          // - Run the effect *once* after the initial render.
          // - Run the cleanup function *once* when the component unmounts.

  // --- The rest of your component's JSX ---
  return (
    <div className={` absolute left-0 text-white h-screen p-2 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      <button onClick={() => setCollapsed(!collapsed)} className="text-sm mb-4">{collapsed ? <TbLayoutSidebarRightCollapseFilled size={30}/> : <TbLayoutSidebarLeftCollapseFilled size={30}/>}</button>

      {!collapsed && (
        <div>
          {['Chat History', 'Tools', 'Personal Info', 'Customize'].map(section => (
            <div key={section} className="mb-2">
              <button onClick={() => toggleSection(section)} className="w-full text-left hover:bg-white/20  p-2 rounded">
                {section}
              </button>
              {openSection === section && (
                <div className="bg-gray-700 p-2 mt-1 text-sm rounded">
                  {/* Replace with actual content */}
                  {section === 'Chat History' ? (
                    <ul>
                      {[...Array(5)].map((_, i) => (
                        <li key={i} className="py-1 border-b border-gray-600">Chat #{5 - i}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Options for {section}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}