// 16 x 16 signed multiply with a full 32-bit product, purely combinational.
module mul16_signed (
  input  logic signed [15:0] a, b,
  output logic signed [31:0] p
);
  assign p = a * b;
endmodule
