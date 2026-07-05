// "How much paint?" calculator for a matched paint: wall dimensions ->
// litres -> tins -> price, with the buy link right next to the answer.
import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Paint } from '../utils/paintMatcher';
import { calcCoverage, parseMetres, COVERAGE_DEFAULTS } from '../utils/coverage';
import BuyButton from './BuyButton';
import { COLORS } from '../theme';

export default function CoverageCalculator({ paint }: { paint: Paint }) {
  const [widthText, setWidthText] = useState('');
  const [heightText, setHeightText] = useState('2.4');
  const [coats, setCoats] = useState(COVERAGE_DEFAULTS.coats);

  const width = parseMetres(widthText);
  const height = parseMetres(heightText);
  const result = width && height ? calcCoverage({ widthM: width, heightM: height, coats }) : null;

  return (
    <View style={cStyles.wrap}>
      <Text style={cStyles.title}>📐 How much paint?</Text>
      <View style={cStyles.inputRow}>
        <View style={cStyles.field}>
          <Text style={cStyles.fieldLabel}>Total wall width (m)</Text>
          <TextInput
            style={cStyles.input}
            keyboardType="decimal-pad"
            placeholder="e.g. 13"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={widthText}
            onChangeText={setWidthText}
          />
        </View>
        <View style={cStyles.field}>
          <Text style={cStyles.fieldLabel}>Height (m)</Text>
          <TextInput
            style={cStyles.input}
            keyboardType="decimal-pad"
            placeholder="2.4"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={heightText}
            onChangeText={setHeightText}
          />
        </View>
        <View style={cStyles.field}>
          <Text style={cStyles.fieldLabel}>Coats</Text>
          <View style={cStyles.coatRow}>
            {[1, 2].map(n => (
              <TouchableOpacity
                key={n}
                style={[cStyles.coatBtn, coats === n && cStyles.coatBtnActive]}
                onPress={() => setCoats(n)}
              >
                <Text style={[cStyles.coatText, coats === n && cStyles.coatTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
      {result ? (
        <View style={cStyles.resultRow}>
          <Text style={cStyles.resultText}>
            {result.areaM2} m² → {result.litres} L → <Text style={cStyles.resultStrong}>
              {result.tins} × {COVERAGE_DEFAULTS.tinSizeL} L tin{result.tins > 1 ? 's' : ''}
            </Text> ≈ £{result.totalPriceGbp}
          </Text>
          <BuyButton paint={paint} compact />
        </View>
      ) : (
        <Text style={cStyles.hint}>
          Add up your wall widths, pop them in, and I'll work out the tins.
        </Text>
      )}
      <Text style={cStyles.assumptions}>
        Assumes {COVERAGE_DEFAULTS.coveragePerLitreM2} m²/L and ~£{COVERAGE_DEFAULTS.tinPriceGbp} per {COVERAGE_DEFAULTS.tinSizeL} L tin.
      </Text>
    </View>
  );
}

const cStyles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  title: { color: COLORS.text, fontSize: 13, fontWeight: '800', marginBottom: 8 },
  inputRow: { flexDirection: 'row', gap: 10 },
  field: { flex: 1 },
  fieldLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 3 },
  input: {
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  coatRow: { flexDirection: 'row', gap: 6 },
  coatBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  coatBtnActive: { backgroundColor: COLORS.accent },
  coatText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '700' },
  coatTextActive: { color: '#fff' },
  resultRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  resultText: { flex: 1, color: COLORS.text, fontSize: 13 },
  resultStrong: { fontWeight: '800' },
  hint: { color: COLORS.textMuted, fontSize: 12, marginTop: 10 },
  assumptions: { color: COLORS.textMuted, fontSize: 10, marginTop: 6 },
});
