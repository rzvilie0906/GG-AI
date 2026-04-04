import React from "react";

export default function MaintenanceWarning() {
  // Get current time in Europe/Bucharest
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  // Romania is UTC+2 or UTC+3 (DST). We'll use +2 for simplicity, but you can improve with a DST check if needed.
  const roTime = new Date(utc + 2 * 60 * 60 * 1000);
  const hour = roTime.getHours();

  // Show warning between 9:00 and 11:00
  if (hour >= 9 && hour < 11) {
    return (
      <div
            style={{
              background: 'linear-gradient(90deg, #23272f 0%, #2d323c 100%)',
              color: '#ffe58f',
              padding: '18px 24px',
              textAlign: 'center',
              fontWeight: 600,
              fontSize: '1.08rem',
              borderBottom: '2px solid #ffd666',
              boxShadow: '0 2px 8px rgba(255, 215, 102, 0.10)',
              letterSpacing: '0.01em',
              zIndex: 1000,
              position: 'relative',
            }}
      >
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{verticalAlign: 'middle'}} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <polygon points="16,4 30,28 2,28" fill="#fffbe6" stroke="#faad14" strokeWidth="2.5"/>
            <rect x="14.25" y="13" width="3.5" height="8" rx="1.75" fill="#faad14"/>
            <rect x="14.25" y="23.5" width="3.5" height="3.5" rx="1.75" fill="#faad14"/>
            <polygon points="16,7 28,26 4,26" fill="#faad14" opacity="0.15"/>
          </svg>
          <span>
            Atenție: Între orele <b>9:00</b> și <b>11:00</b> actualizăm meciurile, cotele și analizele zilnice.<br/>
            Platforma poate fi incompletă sau unele funcții pot fi indisponibile temporar.<br/>
            <span style={{color: '#d48806'}}>Reveniți după ora <b>11:00</b> pentru cea mai bună experiență!</span>
          </span>
        </span>
      </div>
    );
  }
  return null;
}
