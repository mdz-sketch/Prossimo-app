import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import PasswordInput from './PasswordInput';

export default function ImpostaNuovaPassword({ onCompletato }) {
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrore('');

    if (password.length < 6) {
      setErrore('La password deve avere almeno 6 caratteri');
      return;
    }
    if (password !== conferma) {
      setErrore('Le due password non coincidono');
      return;
    }

    setCaricamento(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    setCaricamento(false);

    if (error) {
      setErrore('Errore: ' + error.message);
      return;
    }

    onCompletato(data.user);
  };

  return (
    <div className="board-panel">
      <div className="board-label"><KeyRound size={13} style={{ display: 'inline', marginRight: 6, position: 'relative', top: -1 }} />Imposta nuova password</div>
      <form onSubmit={handleSubmit}>
        <label className="field-label" style={{ marginTop: 0 }}>Nuova password</label>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label className="field-label">Conferma nuova password</label>
        <PasswordInput value={conferma} onChange={(e) => setConferma(e.target.value)} required />
        {errore && <div className="error-box">{errore}</div>}
        <button type="submit" className="cta primary" disabled={caricamento}>
          {caricamento ? 'Salvataggio...' : 'Salva nuova password'}
        </button>
      </form>
    </div>
  );
}
