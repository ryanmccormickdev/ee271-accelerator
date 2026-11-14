// Generic building block: 16x16 signed multiplier, full 32-bit product (combinational).
module mul16s (input signed [15:0] a, input signed [15:0] b, output signed [31:0] p);
  assign p = a * b;
endmodule
