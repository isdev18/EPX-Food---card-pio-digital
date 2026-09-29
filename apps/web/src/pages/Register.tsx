import { useState, type FormEvent } from 'react';
import { Building2, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { api } from '../lib/api';

type AuthResult = { token: string; user: object };

export function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ ownerName: '', restaurantName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api<AuthResult>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          ownerName: form.ownerName,
          restaurantName: form.restaurantName,
          email: form.email,
          password: form.password,
        }),
      });
      localStorage.setItem('epx-token', result.token);
      localStorage.setItem('epx-user', JSON.stringify(result.user));
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível criar sua conta.');
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page">
    <section className="login-visual register-visual">
      <img src="/pizza-hero.png" alt="Pizza artesanal" />
      <div className="login-overlay">
        <Brand />
        <div><span className="kicker">COMECE AGORA</span><h1>Sua pizzaria.<br />Tudo em um só lugar.</h1><p>Organize pedidos, cardápio e atendimento desde o primeiro acesso.</p></div>
        <blockquote>Uma operação mais simples começa com uma boa organização.</blockquote>
      </div>
    </section>
    <section className="login-form-wrap register-form-wrap">
      <form className="login-form register-form" onSubmit={submit}>
        <div className="login-mobile-brand"><Brand /></div>
        <span className="eyebrow">CRIAR CONTA</span>
        <h2>Cadastre sua pizzaria</h2>
        <p>Preencha os dados para acessar o painel.</p>
        <div className="register-grid">
          <label>Seu nome<div className="input-wrap"><UserRound size={18} /><input value={form.ownerName} onChange={(event) => update('ownerName', event.target.value)} autoComplete="name" placeholder="Nome do responsável" minLength={2} required /></div></label>
          <label>Nome da pizzaria<div className="input-wrap"><Building2 size={18} /><input value={form.restaurantName} onChange={(event) => update('restaurantName', event.target.value)} placeholder="Nome do estabelecimento" minLength={2} required /></div></label>
          <label className="register-wide">E-mail<div className="input-wrap"><Mail size={18} /><input value={form.email} onChange={(event) => update('email', event.target.value)} type="email" autoComplete="email" placeholder="seu@email.com" required /></div></label>
          <label>Senha<div className="input-wrap"><LockKeyhole size={18} /><input value={form.password} onChange={(event) => update('password', event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" minLength={8} required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar senha">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <label>Confirmar senha<div className="input-wrap"><LockKeyhole size={18} /><input value={form.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Repita a senha" minLength={8} required /></div></label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="button primary login-submit" disabled={loading}>{loading ? 'Criando conta…' : 'Criar conta'}</button>
        <p className="login-return">Já possui uma conta? <Link to="/login">Entrar no painel</Link></p>
      </form>
    </section>
  </main>;
}
