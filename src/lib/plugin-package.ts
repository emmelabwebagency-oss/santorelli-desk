import { zipSync, strToU8 } from 'fflate';

export function buildPluginZip(php: string, instructions: string) {
  if (!php.startsWith('<?php') || !php.includes('Plugin Name: Santorelli Desk') || !instructions.trim()) {
    throw new Error('I file del connettore non sono validi');
  }
  return zipSync({
    'santorelli-desk/santorelli-desk.php': strToU8(php),
    'santorelli-desk/LEGGIMI.txt': strToU8(instructions),
  }, { level: 6 });
}
