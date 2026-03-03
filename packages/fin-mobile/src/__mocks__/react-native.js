module.exports = {
  Platform: { OS: "ios", select: (obj) => obj.ios },
  StyleSheet: { create: (styles) => styles },
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
};
