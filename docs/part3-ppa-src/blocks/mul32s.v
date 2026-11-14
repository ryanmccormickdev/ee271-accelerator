// Generic building block: 32x32 signed multiplier, full 64-bit product (combinational).
module mul32s (input signed [31:0] a, input signed [31:0] b, output signed [63:0] p);
  assign p = a * b;
endmodule
