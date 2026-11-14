// Way 2: if you KNOW req is one-hot (at most one bit set), the same selection is an AND-OR:
// every input is gated by its own request bit, then all are ORed together. No chain.
// (It only matches prio_chain when req is one-hot.)
module onehot_andor (
  input  logic [7:0]  req,
  input  logic [15:0] d0, d1, d2, d3, d4, d5, d6, d7,
  output logic [15:0] y
);
  assign y = ({16{req[0]}} & d0) | ({16{req[1]}} & d1) | ({16{req[2]}} & d2) | ({16{req[3]}} & d3)
           | ({16{req[4]}} & d4) | ({16{req[5]}} & d5) | ({16{req[6]}} & d6) | ({16{req[7]}} & d7);
endmodule
