// 8 x 8 signed (two's complement) multiply, purely combinational.
module mul8_signed (
  input  logic signed [7:0]  a, b,
  output logic signed [15:0] p
);
  assign p = a * b;              // both operands signed, so the multiply is signed
endmodule
