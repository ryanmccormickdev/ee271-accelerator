// 64-bit adder, purely combinational (the accumulate half of a 64-bit MAC).
module add64 (
  input  logic [63:0] a, b,
  output logic [63:0] s
);
  assign s = a + b;
endmodule
