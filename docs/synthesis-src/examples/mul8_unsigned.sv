// 8 x 8 unsigned multiply, purely combinational (no registers).
module mul8_unsigned (
  input  logic [7:0]  a, b,
  output logic [15:0] p
);
  assign p = a * b;
endmodule
