// Buy-link pills for a paint: primary monetised link (Amazon UK now, Awin
// retailer deeplink once approved) plus an optional direct retailer link.
// Every tap is logged locally before opening the browser.
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Linking } from 'react-native';
import { Paint } from '../utils/paintMatcher';
import { buyLinkFor, directLinkFor, logLinkOut, BuyLink } from '../utils/referral';
import { COLORS } from '../theme';

function openLink(paint: Paint, link: BuyLink) {
  void logLinkOut(paint, link);
  Linking.openURL(link.url).catch(() => {});
}

export default function BuyButton({
  paint,
  compact = false,
}: {
  paint: Paint;
  compact?: boolean;
}) {
  const primary = buyLinkFor(paint);
  const direct = compact ? null : directLinkFor(paint);
  return (
    <View style={bStyles.row}>
      <TouchableOpacity
        style={[bStyles.pill, compact && bStyles.pillCompact]}
        onPress={() => openLink(paint, primary)}
        hitSlop={{ top: 6, bottom: 6 }}
      >
        <Text style={[bStyles.pillText, compact && bStyles.pillTextCompact]}>
          🛒 {compact ? 'Buy' : `Buy · ${primary.retailer}`}
        </Text>
      </TouchableOpacity>
      {direct && direct.url !== primary.url && (
        <TouchableOpacity
          style={[bStyles.pill, bStyles.pillGhost]}
          onPress={() => openLink(paint, direct)}
          hitSlop={{ top: 6, bottom: 6 }}
        >
          <Text style={bStyles.pillText}>{direct.retailer} ↗</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const bStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  pillCompact: { paddingHorizontal: 8, paddingVertical: 3 },
  pillGhost: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pillTextCompact: { fontSize: 10 },
});
