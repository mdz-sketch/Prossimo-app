import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({ value, onChange, required, placeholder }) {
  const [visibile, setVisibile] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visibile ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        style={{ width: '100%', padding: 8, paddingRight: 36, boxSizing: 'border-box' }}
      />
      <button
        type="button"
        onClick={() => setVisibile((v) => !v)}
        aria-label={visibile ? 'Nascondi password' : 'Mostra password'}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          color: '#666',
        }}
      >
        {visibile ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
