// 32 x 32 signed multiply with a full 64-bit product, purely combinational.
module mul32_signed (
  input  logic signed [31:0] a, b,
  output logic signed [63:0] p
);
  assign p = a * b;
endmodule
