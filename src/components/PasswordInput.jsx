import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({ value, onChange, required, placeholder }) {
  const [visibile, setVisibile] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visibile ? 'text' : 'password'}
        className="field-input"
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        style={{ paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setVisibile((v) => !v)}
        aria-label={visibile ? 'Nascondi password' : 'Mostra password'}
        style={{
          position: 'absolute',
          right: 2,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          width: 40,
          height: 40,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9FB3AC',
        }}
      >
        {visibile ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
