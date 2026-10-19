import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetSelector, assetOptions } from '@/components/ui/AssetSelector';
import type { Corridor } from '@/types';

const ISSUER_1 = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const ISSUER_2 = 'GC4HS4CQCZULIOTGLLPGRAAMSBDLFRR6Y7HCUQG66LNQDISXKIXXADIM';
const ISSUER_3 = 'GD76B36XOOH432PICDIVEOD4RU7TEFJ5DZVA2C5MW5LKTSCARK45V3DB';

const mockCorridors: Corridor[] = [
  {
    id: 'usdc-ngn',
    countryCode: 'NG',
    countryName: 'Nigeria',
    from: 'USDC',
    fromIssuer: ISSUER_1,
    fromPeg: 'USD',
    to: 'NGN',
  },
  {
    id: 'usdc-kes',
    countryCode: 'KE',
    countryName: 'Kenya',
    from: 'USDC',
    fromIssuer: ISSUER_1,
    fromPeg: 'USD',
    to: 'KES',
  },
  {
    id: 'usdc-custom',
    countryCode: 'US',
    countryName: 'United States',
    from: 'USDC',
    fromIssuer: ISSUER_2,
    fromPeg: 'USD',
    to: 'USD',
  },
  {
    id: 'arst-ars',
    countryCode: 'AR',
    countryName: 'Argentina',
    from: 'ARST',
    fromIssuer: ISSUER_3,
    fromPeg: 'ARS',
    to: 'ARS',
  },
  {
    id: 'xlm-ngn',
    countryCode: 'NG',
    countryName: 'Nigeria',
    from: 'XLM',
    fromIssuer: null,
    fromPeg: 'XLM',
    to: 'NGN',
  },
];

describe('assetOptions', () => {
  it('dedupes distinct (from, fromIssuer) pairs and keeps first-seen order', () => {
    const options = assetOptions(mockCorridors);
    expect(options).toHaveLength(4);
    expect(options[0]?.value).toBe(`USDC:${ISSUER_1}`);
    expect(options[1]?.value).toBe(`USDC:${ISSUER_2}`);
    expect(options[2]?.value).toBe('ARST');
    expect(options[3]?.value).toBe('XLM');
  });

  it('disambiguates same-code/different-issuer with the first 4 + last 4 chars of issuer', () => {
    const options = assetOptions(mockCorridors);
    const usdc1 = options.find((o) => o.value === `USDC:${ISSUER_1}`);
    const usdc2 = options.find((o) => o.value === `USDC:${ISSUER_2}`);

    expect(usdc1?.label).toContain('GA5Z...KZVN');
    expect(usdc2?.label).toContain('GC4H...ADIM');
  });

  it('keeps simple code value and label when code is unique', () => {
    const options = assetOptions(mockCorridors);
    const arst = options.find((o) => o.value === 'ARST');
    expect(arst).toEqual({
      value: 'ARST',
      label: 'ARST',
    });
  });
});

describe('AssetSelector', () => {
  it('renders a select associated with the Asset label', () => {
    render(<AssetSelector value="ARST" onChange={vi.fn()} corridors={mockCorridors} />);

    const label = screen.getByText('Asset');
    const select = screen.getByRole('combobox');

    expect(label.getAttribute('for')).toBe('asset-select');
    expect(select.getAttribute('id')).toBe('asset-select');
  });

  it('renders one option per asset option and forwards onChange', () => {
    const onChange = vi.fn();
    render(<AssetSelector value="ARST" onChange={onChange} corridors={mockCorridors} />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.getAttribute('value'))).toEqual([
      `USDC:${ISSUER_1}`,
      `USDC:${ISSUER_2}`,
      'ARST',
      'XLM',
    ]);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'XLM' } });
    expect(onChange).toHaveBeenCalledWith('XLM');
  });
});
