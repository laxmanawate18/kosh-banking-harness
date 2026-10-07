import React from 'react';
import { CardRing, Editorial, LuxHero, Rewards, SafetyStatement, UpgradeRail } from './Lux';
import { DoorFinale, Manifesto, Stats } from './Story';

interface HomeProps {
  onLogin: () => void;
  onAsk: (prompt: string) => void;
}

/** One idea per screen. Catalogue, rates and calculators live on their own pages. */
export const HomePage: React.FC<HomeProps> = ({ onLogin, onAsk }) => {
  const openAccount = () => { window.location.hash = '#/products/savings'; };
  return (
    <>
      <LuxHero onOpen={openAccount} onLogin={onLogin} />
      <Manifesto />
      <CardRing />
      <UpgradeRail onAsk={onAsk} />
      <Editorial />
      <Rewards />
      <SafetyStatement />
      <Stats />
      <DoorFinale onOpen={openAccount} onAsk={onAsk} />
    </>
  );
};
